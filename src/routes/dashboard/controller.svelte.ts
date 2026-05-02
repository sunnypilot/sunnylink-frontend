import { goto } from '$app/navigation';
import { v1Client } from '$lib/api/client';
import { logtoClient, authState } from '$lib/logto/auth.svelte';
import { deviceState } from '$lib/stores/device.svelte';
import { preferences } from '$lib/stores/preferences.svelte';
import { statusPolling } from '$lib/stores/statusPolling.svelte';
import { downloadSettingsBackup, fetchAllSettings } from '$lib/utils/settings';
import { formatRelativeTime } from '$lib/utils/time';

export interface DashboardDevice {
	device_id: string;
	alias?: string | null;
	comma_dongle_id?: string | null;
	created_at?: number;
}

export interface DashboardPendingAliasChange {
	deviceId: string;
	oldAlias: string;
	newAlias: string;
}

export interface DashboardControllerDependencies {
	apiClient: unknown;
	authState: typeof authState;
	deviceState: typeof deviceState;
	documentRef: Document | undefined;
	downloadSettingsBackup: typeof downloadSettingsBackup;
	fetchAllSettings: typeof fetchAllSettings;
	formatRelativeTime: typeof formatRelativeTime;
	logger: Pick<Console, 'error'>;
	logtoClient: typeof logtoClient;
	navigate: typeof goto;
	preferences: typeof preferences;
	reloadPage: () => void;
	scheduleAnimationFrame: (callback: FrameRequestCallback) => number | ReturnType<typeof setTimeout>;
	scheduleTimeout: (callback: () => void, timeoutMs: number) => ReturnType<typeof setTimeout>;
	statusPolling: typeof statusPolling;
}

const DEVICE_TYPE_NAMES: Record<string, string> = {
	tizi: 'comma 3X',
	mici: 'comma four',
	tici: 'comma three',
	pc: 'PC'
};

const NETWORK_TYPE_NAMES: Record<string, string> = {
	wifi: 'WiFi',
	cellular: 'Cellular',
	ethernet: 'Ethernet'
};

const defaultDependencies: DashboardControllerDependencies = {
	apiClient: v1Client,
	authState,
	deviceState,
	documentRef: typeof document === 'undefined' ? undefined : document,
	downloadSettingsBackup,
	fetchAllSettings,
	formatRelativeTime,
	logger: console,
	logtoClient,
	navigate: goto,
	preferences,
	reloadPage: () => {
		if (typeof window !== 'undefined') window.location.reload();
	},
	scheduleAnimationFrame:
		typeof requestAnimationFrame === 'undefined'
			? (callback) => setTimeout(() => callback(Date.now()), 0)
			: requestAnimationFrame,
	scheduleTimeout: (callback, timeoutMs) => setTimeout(callback, timeoutMs),
	statusPolling
};

/**
 * Create the dashboard controller with injectable dependencies for tests.
 */
export function createDashboardController(
	overrides: Partial<DashboardControllerDependencies> = {}
) {
	const dependencies = { ...defaultDependencies, ...overrides };
	const state = $state({
		updateAliasModalOpen: false,
		deregisterModalOpen: false,
		deviceToDeregister: null as string | null,
		deviceToDeregisterAlias: '',
		deviceToDeregisterPairedAt: 0,
		deviceToDeregisterIsOnline: false,
		renamingDeviceId: null as string | null,
		offlineSectionOpen: false,
		sessionDismissedNudge: false
	});

	const devices = $derived(dependencies.deviceState.pairedDevices as DashboardDevice[]);
	const nudgeVisible = $derived(
		!dependencies.deviceState.selectedDeviceId &&
			dependencies.preferences.showDashboardNudge &&
			!state.sessionDismissedNudge
	);
	const onlineDevices = $derived.by(() => {
		dependencies.deviceState.version;
		if (!devices) return [];
		const visibleDevices = devices.filter((device) => {
			const status = dependencies.deviceState.onlineStatuses[device.device_id];
			return (
				status === 'online' || status === 'loading' || status === 'error' || status === undefined
			);
		});
		return dependencies.deviceState.sortDevices(visibleDevices);
	});
	const offlineDevices = $derived.by(() => {
		dependencies.deviceState.version;
		if (!devices) return [];
		const hiddenDevices = devices.filter(
			(device) => dependencies.deviceState.onlineStatuses[device.device_id] === 'offline'
		);
		return dependencies.deviceState.sortDevices(hiddenDevices);
	});
	const pendingChanges = $derived(getPendingChanges(devices));

	$effect(() => {
		if (!dependencies.authState.loading && !dependencies.authState.isAuthenticated) {
			dependencies.navigate('/');
		}
	});

	/**
	 * Build the current backup input values for the selected device.
	 */
	function getBackupStartingValues(deviceId: string, fullRefresh: boolean): Record<string, unknown> {
		if (fullRefresh || dependencies.deviceState.backupState.deviceId !== deviceId) {
			return dependencies.deviceState.deviceValues[deviceId] || {};
		}

		return {
			...(dependencies.deviceState.deviceValues[deviceId] || {}),
			...(dependencies.deviceState.backupState.fetchedSettings || {})
		};
	}

	/**
	 * Merge newly fetched backup values into the cached device values.
	 */
	function mergeNewBackupValues(
		deviceId: string,
		currentValues: Record<string, unknown>,
		fetchedSettings: Record<string, unknown>
	): void {
		for (const [settingKey, settingValue] of Object.entries(fetchedSettings)) {
			if (currentValues[settingKey] !== undefined) continue;
			if (!dependencies.deviceState.deviceValues[deviceId]) {
				dependencies.deviceState.deviceValues[deviceId] = {};
			}
			dependencies.deviceState.deviceValues[deviceId][settingKey] = settingValue;
		}
	}

	/**
	 * Close the backup modal shortly after a successful download.
	 */
	function scheduleBackupModalClose(): void {
		if (!dependencies.deviceState.backupState.isOpen) return;
		dependencies.scheduleTimeout(() => {
			dependencies.deviceState.closeBackupModal();
		}, 1000);
	}

	/**
	 * Download a full or incremental settings backup for a device.
	 */
	async function handleDownloadBackup(deviceId: string, fullRefresh: boolean = false): Promise<void> {
		if (!deviceId || dependencies.deviceState.backupState.isDownloading) return;

		const currentValues = getBackupStartingValues(deviceId, fullRefresh);
		dependencies.deviceState.startBackup(deviceId);

		try {
			const token = await dependencies.logtoClient?.getIdToken();
			if (!token) throw new Error('Not authenticated');

			const result = await dependencies.fetchAllSettings(
				deviceId,
				dependencies.apiClient,
				token,
				currentValues,
				(progress, status) => {
					dependencies.deviceState.setBackupProgress(progress, status);
				},
				dependencies.deviceState.backupState.abortController?.signal,
				dependencies.deviceState.deviceSettings[deviceId]
			);

			mergeNewBackupValues(deviceId, currentValues, result.settings);
			dependencies.deviceState.setBackupFetchedSettings(result.settings);

			if (result.failedKeys.length > 0) {
				const fetchedCount = Object.keys(result.settings).length;
				const totalCount = fetchedCount + result.failedKeys.length;
				dependencies.deviceState.finishBackup(
					false,
					`${result.failedKeys.length} of ${totalCount} settings could not be fetched.`,
					result.failedKeys
				);
				return;
			}

			dependencies.downloadSettingsBackup(deviceId, result.settings);
			dependencies.deviceState.finishBackup(true);
			scheduleBackupModalClose();
		} catch (error) {
			if ((error as Error).message === 'Backup cancelled') {
				dependencies.deviceState.finishBackup(false, 'Backup cancelled');
				return;
			}

			dependencies.logger.error('Failed to download backup', error);
			dependencies.deviceState.finishBackup(false, 'Failed to download backup');
		}
	}

	/**
	 * Retry only the settings that failed during the previous backup fetch.
	 */
	async function handleRetryFailedBackup(): Promise<void> {
		const backupState = dependencies.deviceState.backupState;
		if (!backupState.deviceId || !backupState.failedKeys.length || !backupState.fetchedSettings) {
			return;
		}

		const deviceId = backupState.deviceId;
		const failedKeyNames = backupState.failedKeys.map((failedKey) => failedKey.key);
		const previousSettings = { ...backupState.fetchedSettings };

		dependencies.deviceState.startBackup(deviceId);

		try {
			const token = await dependencies.logtoClient?.getIdToken();
			if (!token) throw new Error('Not authenticated');

			const result = await dependencies.fetchAllSettings(
				deviceId,
				dependencies.apiClient,
				token,
				previousSettings,
				(progress, status) => {
					dependencies.deviceState.setBackupProgress(progress, status);
				},
				dependencies.deviceState.backupState.abortController?.signal,
				dependencies.deviceState.deviceSettings[deviceId],
				failedKeyNames
			);

			const mergedSettings = { ...previousSettings, ...result.settings };
			dependencies.deviceState.setBackupFetchedSettings(mergedSettings);

			if (result.failedKeys.length > 0) {
				dependencies.deviceState.finishBackup(
					false,
					`${result.failedKeys.length} settings still could not be fetched.`,
					result.failedKeys
				);
				return;
			}

			dependencies.downloadSettingsBackup(deviceId, mergedSettings);
			dependencies.deviceState.finishBackup(true);
			scheduleBackupModalClose();
		} catch (error) {
			if ((error as Error).message === 'Backup cancelled') {
				dependencies.deviceState.finishBackup(false, 'Backup cancelled');
				return;
			}

			dependencies.logger.error('Failed to retry backup', error);
			dependencies.deviceState.finishBackup(false, 'Retry failed');
		}
	}

	/**
	 * Resolve the display alias for a dashboard device.
	 */
	function getAlias(device: DashboardDevice): string {
		return (
			dependencies.deviceState.aliasOverrides[device.device_id] ??
			dependencies.deviceState.aliases[device.device_id] ??
			device.alias ??
			device.device_id
		);
	}

	/**
	 * Stage an alias change when the edited value differs from the persisted alias.
	 */
	function handleAliasChange(device: DashboardDevice, newAlias: string): void {
		if (!newAlias.trim()) return;
		const originalAlias =
			dependencies.deviceState.aliases[device.device_id] ?? device.alias ?? device.device_id;
		dependencies.deviceState.setAliasOverride(device.device_id, newAlias, originalAlias);
	}

	/**
	 * Build the pending alias-change list used by the save modal.
	 */
	function getPendingChanges(currentDevices: DashboardDevice[]): DashboardPendingAliasChange[] {
		return Object.entries(dependencies.deviceState.aliasOverrides)
			.map(([deviceId, newAlias]) => {
				const matchingDevice = currentDevices.find((device) => device.device_id === deviceId);
				const oldAlias =
					dependencies.deviceState.aliases[deviceId] ?? matchingDevice?.alias ?? deviceId;
				if (newAlias === oldAlias) return null;
				return { deviceId, oldAlias, newAlias };
			})
			.filter((change): change is DashboardPendingAliasChange => change !== null);
	}

	/**
	 * Open the deregistration modal with a snapshot of the selected device.
	 */
	function openDeregisterModal(device: DashboardDevice): void {
		state.deviceToDeregister = device.device_id;
		state.deviceToDeregisterAlias = getAlias(device);
		state.deviceToDeregisterPairedAt = device.created_at ?? 0;
		state.deviceToDeregisterIsOnline =
			dependencies.deviceState.onlineStatuses[device.device_id] === 'online';
		state.deregisterModalOpen = true;
	}

	/**
	 * Start inline alias editing and focus the matching input.
	 */
	function startRename(deviceId: string): void {
		dependencies.scheduleAnimationFrame(() => {
			state.renamingDeviceId = deviceId;
			dependencies.scheduleTimeout(() => {
				const input = dependencies.documentRef?.getElementById(
					`alias-${deviceId}`
				) as HTMLInputElement | null;
				if (!input) return;
				input.focus();
				input.select();
			}, 50);
		});
	}

	/**
	 * Stop inline alias editing.
	 */
	function stopRename(): void {
		state.renamingDeviceId = null;
	}

	/**
	 * Stop editing when the user commits or cancels with the keyboard.
	 */
	function handleRenameKeydown(keyboardEvent: KeyboardEvent): void {
		if (keyboardEvent.key === 'Enter' || keyboardEvent.key === 'Escape') {
			stopRename();
		}
	}

	/**
	 * Get the human-readable connection status for a device.
	 */
	function getStatusText(device: DashboardDevice): string {
		const status = dependencies.deviceState.onlineStatuses[device.device_id];
		const offroad = dependencies.deviceState.offroadStatuses[device.device_id];
		if (!status || status === 'loading') return 'Checking...';
		if (status === 'error') return dependencies.deviceState.lastErrorMessages[device.device_id] || 'Error';
		if (status === 'offline') return 'Offline';
		const offroadText = offroad?.isOffroad ? 'Offroad' : offroad ? 'Driving' : '';
		return offroadText ? `Online · ${offroadText}` : 'Online';
	}

	/**
	 * Get the left-border class that summarizes the device status.
	 */
	function getStripColor(device: DashboardDevice): string {
		const status = dependencies.deviceState.onlineStatuses[device.device_id];
		if (!status || status === 'loading') return 'border-l-[var(--sl-text-3)]/40';
		if (status === 'error') return 'border-l-red-400';
		if (status === 'offline') return 'border-l-[var(--sl-text-3)]/20';
		const offroad = dependencies.deviceState.offroadStatuses[device.device_id];
		if (offroad?.forceOffroad) return 'border-l-amber-400';
		if (offroad?.isOffroad === false) return 'border-l-blue-400';
		return 'border-l-emerald-400';
	}

	/**
	 * Get the friendly device type name from telemetry.
	 */
	function getDeviceTypeName(device: DashboardDevice): string | null {
		const telemetry = dependencies.deviceState.deviceTelemetry[device.device_id];
		const deviceType = telemetry?.deviceType;
		if (!deviceType || deviceType === 'unknown') return null;
		return DEVICE_TYPE_NAMES[deviceType.toLowerCase()] ?? null;
	}

	/**
	 * Get the friendly network type name from telemetry.
	 */
	function getNetworkType(device: DashboardDevice): string | null {
		const telemetry = dependencies.deviceState.deviceTelemetry[device.device_id];
		const networkType = telemetry?.networkType;
		if (!networkType || networkType === 'unknown') return null;
		return NETWORK_TYPE_NAMES[networkType.toLowerCase()] ?? networkType;
	}

	/**
	 * Get the software version cached for a device.
	 */
	function getVersion(device: DashboardDevice): string | null {
		const values = dependencies.deviceState.deviceValues[device.device_id];
		const version = values?.['Version'] as string | undefined;
		return version ?? null;
	}

	/**
	 * Get the shortened commit hash cached for a device.
	 */
	function getCommit(device: DashboardDevice): string | null {
		const values = dependencies.deviceState.deviceValues[device.device_id];
		const commit = values?.['GitCommit'] as string | undefined;
		if (!commit) return null;
		return commit.slice(0, 8);
	}

	/**
	 * Get the branch name cached for a device.
	 */
	function getBranch(device: DashboardDevice): string | null {
		const values = dependencies.deviceState.deviceValues[device.device_id];
		const branch = values?.['GitBranch'] as string | undefined;
		return branch ?? null;
	}

	/**
	 * Get the current driving/offroad state for an online device.
	 */
	function getDrivingState(device: DashboardDevice): string | null {
		const status = dependencies.deviceState.onlineStatuses[device.device_id];
		if (status !== 'online') return null;
		const offroad = dependencies.deviceState.offroadStatuses[device.device_id];
		if (offroad?.forceOffroad) return 'Forced Offroad';
		if (offroad?.isOffroad === false) return 'Onroad';
		if (offroad?.isOffroad === true) return 'Offroad';
		return null;
	}

	/**
	 * Get the timestamp that should be used for last-seen display.
	 */
	function getLastSeen(device: DashboardDevice): number | null {
		const status = dependencies.deviceState.onlineStatuses[device.device_id];
		if (status === 'online') {
			return dependencies.deviceState.lastStatusCheck[device.device_id] ?? null;
		}
		return dependencies.deviceState.lastSeenOnline[device.device_id] ?? null;
	}

	/**
	 * Get the formatted last-seen copy for the device row.
	 */
	function getLastSeenText(device: DashboardDevice): string | null {
		const lastSeen = getLastSeen(device);
		if (!lastSeen) return null;
		return dependencies.formatRelativeTime(lastSeen);
	}

	/**
	 * Persist selection and navigate into the settings page.
	 */
	function handleDeviceClick(device: DashboardDevice): void {
		state.sessionDismissedNudge = true;
		dependencies.deviceState.setSelectedDevice(device.device_id);
		dependencies.navigate('/dashboard/settings/device');
	}

	/**
	 * Mark the session nudge as dismissed without changing preferences.
	 */
	function dismissNudge(): void {
		state.sessionDismissedNudge = true;
	}

	/**
	 * Disable the dashboard nudge preference.
	 */
	function disableDashboardNudge(): void {
		dependencies.preferences.showDashboardNudge = false;
	}

	/**
	 * Toggle visibility for the offline device section.
	 */
	function toggleOfflineSection(): void {
		state.offlineSectionOpen = !state.offlineSectionOpen;
	}

	/**
	 * Open the device pairing modal.
	 */
	function openPairingModal(): void {
		dependencies.deviceState.openPairingModal();
	}

	/**
	 * Discard all staged alias edits.
	 */
	function discardAliasChanges(): void {
		dependencies.deviceState.clearAliasOverrides();
	}

	/**
	 * Open the alias save modal.
	 */
	function openAliasSaveModal(): void {
		state.updateAliasModalOpen = true;
	}

	/**
	 * Start a full backup refresh for the device currently shown in backup state.
	 */
	async function handleFullBackupFromCurrentState(): Promise<void> {
		const deviceId = dependencies.deviceState.backupState.deviceId;
		if (!deviceId) return;
		await handleDownloadBackup(deviceId, true);
	}

	/**
	 * Refresh the page after a device has been deregistered.
	 */
	function handleDeregistered(): void {
		dependencies.reloadPage();
	}

	/**
	 * Return true when the device row should show the loading spinner.
	 */
	function isDeviceLoading(device: DashboardDevice): boolean {
		const status = dependencies.deviceState.onlineStatuses[device.device_id];
		return !status || status === 'loading';
	}

	/**
	 * Return true when the device is currently selected.
	 */
	function isSelectedDevice(device: DashboardDevice): boolean {
		return dependencies.deviceState.selectedDeviceId === device.device_id;
	}

	/**
	 * Return true when the device has the API placeholder dongle ID.
	 */
	function isUnregisteredDevice(device: DashboardDevice): boolean {
		return device.comma_dongle_id?.toLowerCase().replace(/\s/g, '') === 'unregistereddevice';
	}

	return {
		authState: dependencies.authState,
		deviceState: dependencies.deviceState,
		state,
		statusPolling: dependencies.statusPolling,
		get devices() {
			return devices;
		},
		get nudgeVisible() {
			return nudgeVisible;
		},
		get offlineDevices() {
			return offlineDevices;
		},
		get onlineDevices() {
			return onlineDevices;
		},
		get pendingChanges() {
			return pendingChanges;
		},
		dismissNudge,
		disableDashboardNudge,
		getAlias,
		getBranch,
		getCommit,
		getDeviceTypeName,
		getDrivingState,
		getLastSeenText,
		getNetworkType,
		getStatusText,
		getStripColor,
		getVersion,
		handleAliasChange,
		handleDeviceClick,
		handleDeregistered,
		handleDownloadBackup,
		handleRenameKeydown,
		handleRetryFailedBackup,
		isDeviceLoading,
		isSelectedDevice,
		isUnregisteredDevice,
		discardAliasChanges,
		handleFullBackupFromCurrentState,
		openAliasSaveModal,
		openDeregisterModal,
		openPairingModal,
		startRename,
		stopRename,
		toggleOfflineSection
	};
}
