import { beforeNavigate, goto } from '$app/navigation';
import { page } from '$app/state';
import { checkDeviceStatus, fetchSettingsAsync } from '$lib/api/device';
import { logtoClient } from '$lib/logto/auth.svelte';
import { batchPush } from '$lib/stores/batchPush.svelte';
import { deviceState } from '$lib/stores/device.svelte';
import { pendingChanges } from '$lib/stores/pendingChanges.svelte';
import { schemaState } from '$lib/stores/schema.svelte';
import { searchState } from '$lib/stores/search.svelte';
import { statusPolling } from '$lib/stores/statusPolling.svelte';
import type { Panel, SchemaItem, SubPanel } from '$lib/types/schema';
import type { RenderableSetting, SettingCategory } from '$lib/types/settings';
import { decodeParamValue, type ParamType } from '$lib/utils/device';
import { getAllSettings } from '$lib/utils/settings';
import { searchSettings } from '$lib/utils/search';
import { settingToSchemaItem } from '$lib/utils/settingAdapter';
import { createSyncStatus } from '$lib/utils/syncStatus.svelte';
import { untrack } from 'svelte';
import { toast } from 'svelte-sonner';

interface SettingGroup {
	label: string | null;
	settings: RenderableSetting[];
}

interface FetchValuesInput {
	deviceId: string;
	getParamType: (settingKey: string, responseType?: ParamType) => ParamType;
	settingKeys: string[];
	signal?: AbortSignal;
	token: string;
}

export interface SettingsCategoryControllerDependencies {
	batchPush: typeof batchPush;
	checkDeviceStatus: typeof checkDeviceStatus;
	decodeParamValue: typeof decodeParamValue;
	deviceState: typeof deviceState;
	fetchSettingsAsync: typeof fetchSettingsAsync;
	getAllSettings: typeof getAllSettings;
	logtoClient: typeof logtoClient;
	logger: Pick<Console, 'error'>;
	navigate: typeof goto;
	notifySuccess: (message: string) => void;
	pageState: typeof page;
	pendingChanges: typeof pendingChanges;
	registerBeforeNavigate: typeof beforeNavigate;
	schemaState: typeof schemaState;
	searchSettings: typeof searchSettings;
	searchState: typeof searchState;
	settingToSchemaItem: typeof settingToSchemaItem;
	statusPolling: typeof statusPolling;
}

const CHUNK_SIZE = 10;

const defaultDependencies: SettingsCategoryControllerDependencies = {
	batchPush,
	checkDeviceStatus,
	decodeParamValue,
	deviceState,
	fetchSettingsAsync,
	getAllSettings,
	logtoClient,
	logger: console,
	navigate: goto,
	notifySuccess: (message) => toast.success(message),
	pageState: page,
	pendingChanges,
	registerBeforeNavigate: beforeNavigate,
	schemaState,
	searchSettings,
	searchState,
	settingToSchemaItem,
	statusPolling
};

/**
 * Create the settings category controller with injectable dependencies for tests.
 */
export function createSettingsCategoryController(
	overrides: Partial<SettingsCategoryControllerDependencies> = {}
) {
	const dependencies = { ...defaultDependencies, ...overrides };
	const state = $state({
		loadingValues: false,
		pushModalOpen: false,
		revalidatingValues: false,
		subPanelDirection: 'forward' as 'forward' | 'back',
		valuesFetchFailed: false
	});

	const category = $derived(dependencies.pageState.params.category as SettingCategory);
	const deviceId = $derived(dependencies.deviceState.selectedDeviceId);
	const settings = $derived(
		deviceId ? dependencies.deviceState.deviceSettings[deviceId] : undefined
	);
	const deviceValues = $derived(
		deviceId ? dependencies.deviceState.deviceValues[deviceId] : undefined
	);
	const hasChanges = $derived(deviceId ? dependencies.deviceState.hasChanges(deviceId) : false);
	const useSchema = $derived(deviceId ? dependencies.schemaState.hasSchema(deviceId) : false);
	const schemaPanel = $derived.by(() => getSchemaPanel());
	const allSubPanels = $derived.by(() => collectSubPanels(schemaPanel));
	const activeSubPanel = $derived.by(() => getActiveSubPanel(allSubPanels));
	const currentDeviceAlias = $derived(
		deviceId ? (dependencies.deviceState.aliases[deviceId] ?? deviceId) : undefined
	);
	const categorySettings = $derived.by(() => getCategorySettings());
	const writableSettings = $derived(filterSettingsByReadOnly(categorySettings, false));
	const readonlySettings = $derived(filterSettingsByReadOnly(categorySettings, true));
	const writableGroups = $derived(groupSettingsBySection(writableSettings));
	const readonlyGroups = $derived(groupSettingsBySection(readonlySettings));
	const deviceOnlineStatus = $derived(
		deviceId ? dependencies.deviceState.onlineStatuses[deviceId] : undefined
	);
	const isDeviceOfflineOrError = $derived(
		deviceOnlineStatus === 'offline' || deviceOnlineStatus === 'error'
	);
	const legacyVerified = $derived(
		deviceId ? !!dependencies.schemaState.schemaUnavailable[deviceId] && !!settings : false
	);
	const deviceVerified = $derived(
		deviceId
			? isDeviceOfflineOrError ||
					!!dependencies.deviceState.valuesVerifiedThisSession[deviceId] ||
					legacyVerified
			: false
	);
	const isStale = $derived(!!(deviceId && dependencies.deviceState.valuesStale[deviceId]));
	const isDeviceLoading = $derived(deviceOnlineStatus === 'loading');
	const isRevalidating = $derived(
		isDeviceLoading ||
			(!isDeviceOfflineOrError && (state.revalidatingValues || !deviceVerified || isStale))
	);
	const revalidationSucceeded = $derived(
		!isDeviceOfflineOrError &&
			deviceVerified &&
			!state.revalidatingValues &&
			!state.valuesFetchFailed &&
			!isStale
	);
	const batchActive = $derived(deviceId ? dependencies.batchPush.isActive(deviceId) : false);
	const sync = createSyncStatus(
		() => isRevalidating || batchActive,
		() => revalidationSucceeded && !batchActive
	);

	dependencies.registerBeforeNavigate(({ type, to }) => {
		if (type !== 'popstate') return;

		const toPanel = to?.url.searchParams.get('panel');
		const fromPanel = dependencies.pageState.url.searchParams.get('panel');
		if (fromPanel && !toPanel) {
			state.subPanelDirection = 'back';
		} else if (!fromPanel && toPanel) {
			state.subPanelDirection = 'forward';
		}
	});

	$effect(() => {
		if (
			deviceId &&
			dependencies.logtoClient &&
			!dependencies.schemaState.schemas[deviceId] &&
			!dependencies.schemaState.loading[deviceId]
		) {
			loadSchema();
		}
	});

	$effect(() => {
		category;
		state.loadingValues = false;
		state.revalidatingValues = false;
		state.valuesFetchFailed = false;
	});

	$effect(() => {
		if (deviceId && dependencies.logtoClient && useSchema && schemaPanel) {
			if (shouldSkipFetch()) return;
			const abortController = new AbortController();
			fetchSchemaValues(abortController.signal);
			return () => abortController.abort('effect cleanup');
		}
	});

	$effect(() => {
		if (deviceId && dependencies.logtoClient && !useSchema && categorySettings.length > 0) {
			if (shouldSkipFetch()) return;
			const abortController = new AbortController();
			fetchCurrentValues(abortController.signal);
			return () => abortController.abort('effect cleanup');
		}
	});

	$effect(() => {
		if (dependencies.pageState.url.searchParams.get('openPush') === 'true') {
			state.pushModalOpen = true;
			const nextUrl = new URL(dependencies.pageState.url);
			nextUrl.searchParams.delete('openPush');
			dependencies.navigate(nextUrl.toString(), {
				replaceState: true,
				keepFocus: true,
				noScroll: true
			});
		}
	});

	/**
	 * Get the schema panel matching the active category.
	 */
	function getSchemaPanel(): Panel | undefined {
		if (!deviceId || !useSchema) return undefined;
		const schema = dependencies.schemaState.schemas[deviceId];
		if (!schema) return undefined;
		return schema.panels.find((panel) => panel.id === category);
	}

	/**
	 * Load the selected device schema when it is missing from cache.
	 */
	async function loadSchema(): Promise<void> {
		if (!deviceId || !dependencies.logtoClient) return;

		try {
			const token = await dependencies.logtoClient.getIdToken();
			if (!token) return;
			const gitCommit = dependencies.deviceState.deviceValues[deviceId]?.['GitCommit'] as
				| string
				| undefined;
			await dependencies.schemaState.loadSchema(deviceId, token, gitCommit);
		} catch (error) {
			dependencies.logger.error('Failed to load schema:', error);
		}
	}

	/**
	 * Collect every sub-panel reachable from the active panel.
	 */
	function collectSubPanels(panel: Panel | undefined): SubPanel[] {
		if (!panel) return [];
		const subPanels: SubPanel[] = [...(panel.sub_panels ?? [])];
		for (const section of panel.sections ?? []) {
			for (const subPanel of section.sub_panels ?? []) {
				subPanels.push(subPanel);
			}
		}
		return subPanels;
	}

	/**
	 * Resolve the active sub-panel from the current URL query param.
	 */
	function getActiveSubPanel(subPanels: SubPanel[]): SubPanel | null {
		const panelId = dependencies.pageState.url.searchParams.get('panel');
		if (!panelId || subPanels.length === 0) return null;
		return subPanels.find((subPanel) => subPanel.id === panelId) ?? null;
	}

	/**
	 * Navigate into a schema sub-panel.
	 */
	function openSubPanel(subPanel: SubPanel): void {
		state.subPanelDirection = 'forward';
		const nextUrl = new URL(dependencies.pageState.url);
		nextUrl.searchParams.set('panel', subPanel.id);
		dependencies.navigate(nextUrl.toString(), { keepFocus: true, noScroll: true });
	}

	/**
	 * Navigate back to the parent schema panel.
	 */
	function closeSubPanel(): void {
		state.subPanelDirection = 'back';
		const nextUrl = new URL(dependencies.pageState.url);
		nextUrl.searchParams.delete('panel');
		dependencies.navigate(nextUrl.toString(), { keepFocus: true, noScroll: true });
	}

	/**
	 * Get visible settings for the active category and search query.
	 */
	function getCategorySettings(): RenderableSetting[] {
		const allSettings = dependencies
			.getAllSettings(settings)
			.filter((setting) => setting.category === category);
		if (!dependencies.searchState.query.trim()) return allSettings;
		const searchResults = dependencies.searchSettings(
			dependencies.searchState.query,
			allSettings,
			deviceValues
		);
		return searchResults.map((searchResult) => searchResult.setting);
	}

	/**
	 * Keep section headers only when followed by matching settings.
	 */
	function filterSettingsByReadOnly(
		settingsToFilter: RenderableSetting[],
		readOnly: boolean
	): RenderableSetting[] {
		let currentSection: RenderableSetting | null = null;
		const filteredSettings: RenderableSetting[] = [];

		for (const setting of settingsToFilter) {
			if (setting.isSection) {
				currentSection = setting;
			} else if (!!setting.readonly === readOnly) {
				if (currentSection) {
					filteredSettings.push(currentSection);
					currentSection = null;
				}
				filteredSettings.push(setting);
			}
		}

		return filteredSettings;
	}

	/**
	 * Split settings into visual groups under their section labels.
	 */
	function groupSettingsBySection(settingsToGroup: RenderableSetting[]): SettingGroup[] {
		const groups: SettingGroup[] = [];
		let currentGroup: SettingGroup = {
			label: null,
			settings: []
		};

		for (const setting of settingsToGroup) {
			if (setting.isSection) {
				if (currentGroup.settings.length > 0) groups.push(currentGroup);
				currentGroup = { label: setting.label || null, settings: [] };
			} else {
				currentGroup.settings.push(setting);
			}
		}

		if (currentGroup.settings.length > 0) groups.push(currentGroup);
		return groups;
	}

	/**
	 * Return true when the selected device does not need a page-level fetch.
	 */
	function shouldSkipFetch(): boolean {
		const offline = untrack(() => isDeviceOfflineOrError);
		if (offline) return true;
		const verified = untrack(() => deviceVerified);
		const stale = untrack(() => isStale);
		return verified && !stale;
	}

	/**
	 * Split an array into fixed-size chunks.
	 */
	function chunkArray<Item>(array: Item[], size: number): Item[][] {
		const chunks: Item[][] = [];
		for (let startIndex = 0; startIndex < array.length; startIndex += size) {
			chunks.push(array.slice(startIndex, startIndex + size));
		}
		return chunks;
	}

	/**
	 * Collect all schema items contained by a panel.
	 */
	function collectPanelItems(panel: Panel): SchemaItem[] {
		return [
			...(panel.items ?? []),
			...(panel.sub_panels ?? []).flatMap((subPanel) => subPanel.items),
			...(panel.sections ?? []).flatMap((section) => [
				...section.items,
				...(section.sub_panels ?? []).flatMap((subPanel) => subPanel.items)
			])
		];
	}

	/**
	 * Collect all unique parameter keys contained by a schema panel.
	 */
	function collectPanelKeys(panel: Panel): string[] {
		const keys: string[] = [];
		for (const item of collectPanelItems(panel)) {
			keys.push(item.key);
			for (const subItem of item.sub_items ?? []) {
				keys.push(subItem.key);
			}
		}
		return [...new Set(keys)];
	}

	/**
	 * Return true when a pushed or pending value should remain visible.
	 */
	function shouldPreservePendingValue(deviceIdToCheck: string, settingKey: string): boolean {
		const pendingChange = dependencies.pendingChanges.getForKey(deviceIdToCheck, settingKey);
		const pendingChangeActive =
			pendingChange &&
			(pendingChange.status === 'pending' ||
				pendingChange.status === 'pushing' ||
				pendingChange.status === 'blocked_onroad');
		return dependencies.batchPush.hasPendingKey(deviceIdToCheck, settingKey) || !!pendingChangeActive;
	}

	/**
	 * Fetch settings in chunks and write decoded values into device state.
	 */
	async function fetchAndStoreValues({
		deviceId,
		getParamType,
		settingKeys,
		signal,
		token
	}: FetchValuesInput): Promise<void> {
		const chunks = chunkArray(settingKeys, CHUNK_SIZE);

		await Promise.all(
			chunks.map(async (chunk) => {
				if (signal?.aborted) return;

				try {
					const response = await dependencies.fetchSettingsAsync(deviceId, chunk, token, { signal });
					if (signal?.aborted || !response.items) return;

					const values = (dependencies.deviceState.deviceValues[deviceId] ??= {});
					for (const settingItem of response.items) {
						if (!settingItem.key || settingItem.value === undefined) continue;
						if (shouldPreservePendingValue(deviceId, settingItem.key)) continue;

						values[settingItem.key] = dependencies.decodeParamValue({
							key: settingItem.key,
							value: settingItem.value,
							type: getParamType(settingItem.key, settingItem.type as ParamType | undefined)
						});
					}
				} catch (error) {
					if (isAbortError(error)) return;
					dependencies.logger.error('Failed to fetch chunk of values:', error);
				}
			})
		);
	}

	/**
	 * Return true when an error is an abort from navigation cleanup.
	 */
	function isAbortError(error: unknown): boolean {
		return (error as { name?: string })?.name === 'AbortError';
	}

	/**
	 * Get a default value for a schema item when the device omits it.
	 */
	function getDefaultValueForSchemaItem(item: SchemaItem): unknown {
		if (item.widget === 'toggle') return false;
		if (item.widget === 'option' || item.widget === 'multiple_button') {
			return item.options?.[0]?.value ?? '';
		}
		return '';
	}

	/**
	 * Fill schema defaults for keys the device did not return.
	 */
	function fillMissingSchemaDefaults(deviceIdToUpdate: string, panel: Panel): void {
		const values = (dependencies.deviceState.deviceValues[deviceIdToUpdate] ??= {});
		for (const item of collectPanelItems(panel)) {
			if (values[item.key] !== undefined) continue;
			values[item.key] = getDefaultValueForSchemaItem(item);
		}
	}

	/**
	 * Fetch values needed by schema rendering for the current panel.
	 */
	async function fetchSchemaValues(signal?: AbortSignal): Promise<void> {
		if (!deviceId || !dependencies.logtoClient || !schemaPanel) return;

		const currentDeviceId = deviceId;
		const currentSchemaPanel = schemaPanel;
		state.valuesFetchFailed = false;

		const settingKeys = collectPanelKeys(currentSchemaPanel);
		const existingValues = dependencies.deviceState.deviceValues[currentDeviceId] ?? {};
		if (settingKeys.length === 0) {
			state.loadingValues = false;
			return;
		}

		const hasAnyValues = settingKeys.some((settingKey) => existingValues[settingKey] !== undefined);
		if (!hasAnyValues) state.loadingValues = true;
		else state.revalidatingValues = true;

		try {
			const token = await dependencies.logtoClient.getIdToken();
			if (!token || signal?.aborted) return;

			dependencies.deviceState.deviceValues[currentDeviceId] ??= {};
			await fetchAndStoreValues({
				deviceId: currentDeviceId,
				getParamType: (_settingKey, responseType) => responseType ?? 'String',
				settingKeys,
				signal,
				token
			});

			if (signal?.aborted) return;
			fillMissingSchemaDefaults(currentDeviceId, currentSchemaPanel);
		} catch (error) {
			if (isAbortError(error)) return;
			dependencies.logger.error('Failed to fetch schema values:', error);
			state.valuesFetchFailed = true;
		} finally {
			if (!signal?.aborted) {
				state.loadingValues = false;
				state.revalidatingValues = false;
				dependencies.deviceState.valuesVerifiedThisSession[currentDeviceId] = true;
				dependencies.statusPolling.confirmReachable(currentDeviceId);
			}
		}
	}

	/**
	 * Fetch values needed by legacy settings rendering for the current category.
	 */
	async function fetchCurrentValues(signal?: AbortSignal): Promise<void> {
		if (!deviceId || !dependencies.logtoClient) return;

		const currentDeviceId = deviceId;
		const settingKeys = categorySettings.map((setting) => setting.key);
		if (settingKeys.length === 0) return;

		state.loadingValues = true;

		try {
			const token = await dependencies.logtoClient.getIdToken();
			if (!token || signal?.aborted) return;

			dependencies.deviceState.deviceValues[currentDeviceId] ??= {};
			await fetchAndStoreValues({
				deviceId: currentDeviceId,
				getParamType: (settingKey) => {
					const definition = categorySettings.find((setting) => setting.key === settingKey);
					return (definition?.value?.type ?? 'String') as ParamType;
				},
				settingKeys,
				signal,
				token
			});
		} catch (error) {
			if (isAbortError(error)) return;
			dependencies.logger.error('Failed to fetch current values:', error);
		} finally {
			if (!signal?.aborted) state.loadingValues = false;
		}
	}

	/**
	 * Refresh values and capability-derived rules after a successful push.
	 */
	async function handlePushSuccess(): Promise<void> {
		if (useSchema) {
			fetchSchemaValues();
			if (deviceId && dependencies.logtoClient) {
				const token = await dependencies.logtoClient.getIdToken();
				if (token) dependencies.schemaState.refreshCapabilities(deviceId, token);
			}
		} else {
			fetchCurrentValues();
		}
		dependencies.notifySuccess('Settings pushed successfully!');
	}

	/**
	 * Mark values stale and ask the polling layer to refresh device status.
	 */
	function handleManualRefresh(): void {
		if (!deviceId || !dependencies.logtoClient) return;
		dependencies.deviceState.valuesStale[deviceId] = true;
		dependencies.logtoClient.getIdToken().then((token) => {
			if (!token || !deviceId) return;
			dependencies.schemaState.refreshCapabilities(deviceId, token);
			dependencies.checkDeviceStatus(deviceId, token, true, false);
		});
	}

	/**
	 * Convert a legacy setting definition into a schema-renderable item.
	 */
	function getSchemaItem(setting: RenderableSetting): SchemaItem {
		return dependencies.settingToSchemaItem(setting);
	}

	/**
	 * Open the push confirmation modal.
	 */
	function openPushModal(): void {
		state.pushModalOpen = true;
	}

	/**
	 * Clear staged changes for the active device.
	 */
	function resetCurrentDeviceChanges(): void {
		if (!deviceId) return;
		dependencies.deviceState.clearChanges(deviceId);
	}

	return {
		state,
		sync,
		get activeSubPanel() {
			return activeSubPanel;
		},
		get category() {
			return category;
		},
		get categorySettings() {
			return categorySettings;
		},
		get currentDeviceAlias() {
			return currentDeviceAlias;
		},
		get deviceId() {
			return deviceId;
		},
		get hasChanges() {
			return hasChanges;
		},
		get isDeviceOfflineOrError() {
			return isDeviceOfflineOrError;
		},
		get readonlyGroups() {
			return readonlyGroups;
		},
		get readonlySettings() {
			return readonlySettings;
		},
		get schemaPanel() {
			return schemaPanel;
		},
		get settings() {
			return settings;
		},
		get useSchema() {
			return useSchema;
		},
		get writableGroups() {
			return writableGroups;
		},
		get writableSettings() {
			return writableSettings;
		},
		closeSubPanel,
		getSchemaItem,
		handleManualRefresh,
		handlePushSuccess,
		openPushModal,
		openSubPanel,
		resetCurrentDeviceChanges
	};
}
