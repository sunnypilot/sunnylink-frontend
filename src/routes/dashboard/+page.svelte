<script lang="ts">
	import { goto } from '$app/navigation';
	import { authState, logtoClient } from '$lib/logto/auth.svelte';
	import { deviceState } from '$lib/stores/device.svelte';
	import UpdateAliasModal from '$lib/components/UpdateAliasModal.svelte';
	import DeregisterDeviceModal from '$lib/components/DeregisterDeviceModal.svelte';
	import DashboardSkeleton from './DashboardSkeleton.svelte';
	import DeviceRowMenu from '$lib/components/DeviceRowMenu.svelte';
	import RefreshIndicator from '$lib/components/RefreshIndicator.svelte';
	import { formatRelativeTime } from '$lib/utils/time';
	import { statusPolling } from '$lib/stores/statusPolling.svelte';
	import {
		Save,
		Plus,
		Loader2,
		ChevronDown,
		ChevronRight,
		Pencil
	} from 'lucide-svelte';
	import { slide } from 'svelte/transition';
	import BackupProgressModal from '$lib/components/BackupProgressModal.svelte';
	import { downloadSettingsBackup, fetchAllSettings } from '$lib/utils/settings';
	import { v1Client } from '$lib/api/client';
	import { preferences } from '$lib/stores/preferences.svelte';
	import { pendingChanges as pendingChangesStore } from '$lib/stores/pendingChanges.svelte';
	import { Mouse } from 'lucide-svelte';

	let { data } = $props();

	let updateAliasModalOpen = $state(false);
	let deregisterModalOpen = $state(false);
	let deviceToDeregister = $state<string | null>(null);
	let deviceToDeregisterAlias = $state<string>('');
	let deviceToDeregisterPairedAt = $state<number>(0);
	let deviceToDeregisterIsOnline = $state<boolean>(false);
	let renamingDeviceId = $state<string | null>(null);
	let offlineSectionOpen = $state(false);

	async function handleDownloadBackup(deviceId: string, fullRefresh: boolean = false) {
		if (!deviceId || deviceState.backupState.isDownloading) return;

		const currentValues =
			fullRefresh || deviceState.backupState.deviceId !== deviceId
				? deviceState.deviceValues[deviceId] || {}
				: {
						...(deviceState.deviceValues[deviceId] || {}),
						...(deviceState.backupState.fetchedSettings || {})
					};

		deviceState.startBackup(deviceId);

		try {
			const token = await logtoClient?.getIdToken();
			if (!token) throw new Error('Not authenticated');

			const result = await fetchAllSettings(
				deviceId,
				v1Client,
				token,
				currentValues,
				(progress, status) => {
					deviceState.setBackupProgress(progress, status);
				},
				deviceState.backupState.abortController?.signal,
				deviceState.deviceSettings[deviceId]
			);

			Object.entries(result.settings).forEach(([key, value]) => {
				if (currentValues[key] === undefined) {
					if (!deviceState.deviceValues[deviceId]) deviceState.deviceValues[deviceId] = {};
					(deviceState.deviceValues[deviceId] as Record<string, unknown>)[key] = value;
				}
			});

			deviceState.setBackupFetchedSettings(result.settings);

			if (result.failedKeys.length > 0) {
				deviceState.finishBackup(
					false,
					`${result.failedKeys.length} of ${Object.keys(result.settings).length + result.failedKeys.length} settings could not be fetched.`,
					result.failedKeys
				);
			} else {
				downloadSettingsBackup(deviceId, result.settings);
				deviceState.finishBackup(true);
				if (deviceState.backupState.isOpen) {
					setTimeout(() => {
						deviceState.closeBackupModal();
					}, 1000);
				}
			}
		} catch (e: any) {
			if (e.message === 'Backup cancelled') {
				deviceState.finishBackup(false, 'Backup cancelled');
			} else {
				console.error('Failed to download backup', e);
				deviceState.finishBackup(false, 'Failed to download backup');
			}
		}
	}

	async function handleRetryFailedBackup() {
		const bs = deviceState.backupState;
		if (!bs.deviceId || !bs.failedKeys.length || !bs.fetchedSettings) return;

		const deviceId = bs.deviceId;
		const failedKeyNames = bs.failedKeys.map((f) => f.key);
		const previousSettings = { ...bs.fetchedSettings };

		deviceState.startBackup(deviceId);

		try {
			const token = await logtoClient?.getIdToken();
			if (!token) throw new Error('Not authenticated');

			const result = await fetchAllSettings(
				deviceId,
				v1Client,
				token,
				previousSettings,
				(progress, status) => {
					deviceState.setBackupProgress(progress, status);
				},
				deviceState.backupState.abortController?.signal,
				deviceState.deviceSettings[deviceId],
				failedKeyNames
			);

			const mergedSettings = { ...previousSettings, ...result.settings };
			deviceState.setBackupFetchedSettings(mergedSettings);

			if (result.failedKeys.length > 0) {
				deviceState.finishBackup(
					false,
					`${result.failedKeys.length} settings still could not be fetched.`,
					result.failedKeys
				);
			} else {
				downloadSettingsBackup(deviceId, mergedSettings);
				deviceState.finishBackup(true);
				if (deviceState.backupState.isOpen) {
					setTimeout(() => {
						deviceState.closeBackupModal();
					}, 1000);
				}
			}
		} catch (e: any) {
			if (e.message === 'Backup cancelled') {
				deviceState.finishBackup(false, 'Backup cancelled');
			} else {
				console.error('Failed to retry backup', e);
				deviceState.finishBackup(false, 'Retry failed');
			}
		}
	}

	$effect(() => {
		if (!authState.loading && !authState.isAuthenticated) {
			goto('/');
		}
	});

	function getAlias(device: any) {
		return (
			deviceState.aliasOverrides[device.device_id] ??
			deviceState.aliases[device.device_id] ??
			device.alias ??
			device.device_id
		);
	}

	function handleAliasChange(device: any, newAlias: string) {
		if (!newAlias.trim()) return;
		const originalAlias = deviceState.aliases[device.device_id] ?? device.alias ?? device.device_id;
		deviceState.setAliasOverride(device.device_id, newAlias, originalAlias);
	}

	function getPendingChanges(devices: any[]) {
		return Object.entries(deviceState.aliasOverrides)
			.map(([deviceId, newAlias]) => {
				const device = devices.find((d) => d.device_id === deviceId);
				const oldAlias = deviceState.aliases[deviceId] ?? device?.alias ?? deviceId;
				if (newAlias === oldAlias) return null;
				return { deviceId, oldAlias, newAlias };
			})
			.filter((c) => c !== null) as Array<{ deviceId: string; oldAlias: string; newAlias: string }>;
	}

	function formatDateShort(timestamp: number | undefined) {
		if (!timestamp) return '';
		return new Date(timestamp * 1000).toLocaleDateString(undefined, {
			year: 'numeric',
			month: 'short',
			day: 'numeric'
		});
	}

	function openDeregisterModal(device: any) {
		deviceToDeregister = device.device_id;
		deviceToDeregisterAlias = getAlias(device);
		deviceToDeregisterPairedAt = device.created_at;
		deviceToDeregisterIsOnline = deviceState.onlineStatuses[device.device_id] === 'online';
		deregisterModalOpen = true;
	}

	function startRename(did: string) {
		requestAnimationFrame(() => {
			renamingDeviceId = did;
			setTimeout(() => {
				const input = document.getElementById(`alias-${did}`) as HTMLInputElement;
				if (input) {
					input.focus();
					input.select();
				}
			}, 50);
		});
	}

	function getStatusText(device: any): string {
		const status = deviceState.onlineStatuses[device.device_id];
		const offroad = deviceState.offroadStatuses[device.device_id];
		if (!status || status === 'loading') return 'Checking...';
		if (status === 'error') return deviceState.lastErrorMessages[device.device_id] || 'Error';
		if (status === 'offline') return 'Offline';
		const offroadText = offroad?.isOffroad ? 'Offroad' : offroad ? 'Driving' : '';
		return offroadText ? `Online · ${offroadText}` : 'Online';
	}

	function getStatusDotClass(device: any): string {
		const status = deviceState.onlineStatuses[device.device_id];
		if (!status || status === 'loading') return 'bg-[var(--sl-text-3)] animate-pulse';
		if (status === 'error') return 'bg-red-400';
		if (status === 'offline') return 'bg-[var(--sl-text-3)]/50';
		// Online — check offroad state for color
		const offroad = deviceState.offroadStatuses[device.device_id];
		if (offroad?.forceOffroad) return 'bg-amber-400';
		if (offroad?.isOffroad === false) return 'bg-blue-400';
		return 'bg-emerald-400';
	}

	function getStripColor(device: any): string {
		const status = deviceState.onlineStatuses[device.device_id];
		if (!status || status === 'loading') return 'border-l-[var(--sl-text-3)]/40';
		if (status === 'error') return 'border-l-red-400';
		if (status === 'offline') return 'border-l-[var(--sl-text-3)]/20';
		const offroad = deviceState.offroadStatuses[device.device_id];
		if (offroad?.forceOffroad) return 'border-l-amber-400';
		if (offroad?.isOffroad === false) return 'border-l-blue-400';
		return 'border-l-emerald-400';
	}

	/**
	 * Top-edge status stripe is 3 segments (connection, driving, pending changes).
	 * At-a-glance health: each segment lights only when its condition is active,
	 * so a healthy-idle device stays visually calm.
	 */
	function getConnectionSegColor(device: any): string {
		const status = deviceState.onlineStatuses[device.device_id];
		if (status === 'error') return 'bg-red-400';
		if (status === 'offline') return 'bg-[var(--sl-text-3)]/15';
		if (!status || status === 'loading') return 'bg-[var(--sl-text-3)]/30';
		return 'bg-emerald-400';
	}

	function getDrivingSegColor(device: any): string {
		const status = deviceState.onlineStatuses[device.device_id];
		if (status !== 'online') return 'bg-[var(--sl-text-3)]/15';
		const offroad = deviceState.offroadStatuses[device.device_id];
		if (offroad?.forceOffroad) return 'bg-amber-400';
		if (offroad?.isOffroad === false) return 'bg-blue-400';
		return 'bg-[var(--sl-text-3)]/15';
	}

	function getPendingSegColor(device: any): string {
		const count = pendingChangesStore.getByStatus(device.device_id, 'pending').length;
		return count > 0 ? 'bg-amber-500' : 'bg-[var(--sl-text-3)]/15';
	}

	/**
	 * Primary glance values for the stat strip. Return null when unknown so the
	 * template can render a stable "—" slot instead of shifting layout.
	 */
	function formatLastSeenShort(device: any, _tick?: number): string | null {
		// _tick unused in body — receiving it ties the template call site to
		// `statusPolling.tickCounter` so the relative-time string re-renders each poll.
		const ts = getLastSeen(device);
		if (!ts) return null;
		return formatRelativeTime(ts);
	}

	function getSubtitle(device: any): string {
		const parts: string[] = [];
		const typeName = getDeviceTypeName(device);
		if (typeName) parts.push(typeName);
		const driving = getDrivingState(device);
		if (driving) parts.push(driving);
		else {
			const statusText = getStatusText(device);
			if (statusText && statusText !== 'Checking...') parts.push(statusText);
		}
		return parts.join(' \u00b7 ');
	}

	const DEVICE_TYPE_NAMES: Record<string, string> = {
		tizi: 'comma 3X',
		mici: 'comma four',
		tici: 'comma three',
		pc: 'PC'
	};

	function getDeviceTypeName(device: any): string | null {
		const telemetry = deviceState.deviceTelemetry[device.device_id];
		const type = telemetry?.deviceType;
		if (!type || type === 'unknown') return null;
		return DEVICE_TYPE_NAMES[type.toLowerCase()] ?? null;
	}

	function getNetworkType(device: any): string | null {
		const telemetry = deviceState.deviceTelemetry[device.device_id];
		const type = telemetry?.networkType;
		if (!type || type === 'unknown') return null;
		const map: Record<string, string> = {
			wifi: 'WiFi',
			cellular: 'Cellular',
			ethernet: 'Ethernet'
		};
		return map[type.toLowerCase()] ?? type;
	}

	function getVersion(device: any): string | null {
		const values = deviceState.deviceValues[device.device_id];
		const ver = values?.['Version'] as string | undefined;
		if (!ver) return null;
		return ver;
	}

	function getCommit(device: any): string | null {
		const values = deviceState.deviceValues[device.device_id];
		const commit = values?.['GitCommit'] as string | undefined;
		if (!commit) return null;
		return commit.slice(0, 8);
	}

	function getBranch(device: any): string | null {
		const values = deviceState.deviceValues[device.device_id];
		const branch = values?.['GitBranch'] as string | undefined;
		if (!branch) return null;
		return branch;
	}

	function getDrivingState(device: any): string | null {
		const status = deviceState.onlineStatuses[device.device_id];
		if (status !== 'online') return null;
		const offroad = deviceState.offroadStatuses[device.device_id];
		if (offroad?.forceOffroad) return 'Forced Offroad';
		if (offroad?.isOffroad === false) return 'Onroad';
		if (offroad?.isOffroad === true) return 'Offroad';
		return null;
	}

	function getLastSeen(device: any): number | null {
		const status = deviceState.onlineStatuses[device.device_id];
		if (status === 'online') {
			// Online: show when we last confirmed it
			return deviceState.lastStatusCheck[device.device_id] ?? null;
		}
		// Offline/error: show when it was last online (not when we last polled)
		return deviceState.lastSeenOnline[device.device_id] ?? null;
	}

	function handleDeviceClick(device: any) {
		sessionDismissedNudge = true;
		deviceState.setSelectedDevice(device.device_id);
		goto('/dashboard/settings/device');
	}

	// Nudge: show hint for first-time users when no device is selected
	let showNudge = $derived(!deviceState.selectedDeviceId && preferences.showDashboardNudge);
	let sessionDismissedNudge = $state(false);
	let nudgeVisible = $derived(showNudge && !sessionDismissedNudge);

	// Use cached devices from deviceState for instant rendering; update when API returns
	let devices = $derived(deviceState.pairedDevices);

	let onlineDevices = $derived.by(() => {
		deviceState.version;
		if (!devices) return [];
		const list = devices.filter((d) => {
			const status = deviceState.onlineStatuses[d.device_id];
			return (
				status === 'online' || status === 'loading' || status === 'error' || status === undefined
			);
		});
		return deviceState.sortDevices(list);
	});

	let offlineDevices = $derived.by(() => {
		deviceState.version;
		if (!devices) return [];
		const list = devices.filter((d) => deviceState.onlineStatuses[d.device_id] === 'offline');
		return deviceState.sortDevices(list);
	});

	let pendingChanges = $derived(getPendingChanges(devices));
</script>

{#if authState.loading}
	<!-- Auth state still resolving — don't render content and don't let the guard $effect fire prematurely -->
	<DashboardSkeleton name={authState.profile?.name ?? undefined} />
{:else if !authState.isAuthenticated}
	<!-- Guard $effect above handles goto('/'); render nothing while redirect is in flight -->
{:else if devices.length === 0 && !deviceState.pairedDevicesLoaded}
	<!-- Cold start: no cached devices, API hasn't returned yet — show skeleton -->
	<DashboardSkeleton name={authState.profile?.name ?? undefined} />
{:else}
	<div class="mx-auto w-full max-w-2xl pb-24 xl:max-w-3xl">
		{#if devices.length === 0}
			<!-- API returned but no devices — true empty state -->
			<div class="flex flex-col items-center justify-center py-16 text-center">
				<p class="text-sm text-[var(--sl-text-2)]">No devices connected</p>
				<p class="mt-1 text-xs text-[var(--sl-text-3)]">Pair a sunnypilot device to get started.</p>
				<button
					class="btn mt-6 gap-2 border-[var(--sl-border)] bg-[var(--sl-bg-elevated)] text-[var(--sl-text-1)] btn-sm hover:bg-[var(--sl-bg-subtle)]"
					onclick={() => deviceState.openPairingModal()}
				>
					<Plus size={16} />
					Pair Device
				</button>
			</div>
		{:else}
			<div class="mb-6 px-4">
				<h1
					class="text-[24px] leading-[32px] font-medium tracking-[-0.16px] text-[var(--sl-text-1)]"
				>
					Dashboard
				</h1>
				<p class="mt-1 text-[0.8125rem] text-[var(--sl-text-2)]">
					{devices.length} device{devices.length === 1 ? '' : 's'}
				</p>
			</div>

			{#if nudgeVisible}
				<div class="mb-4 px-4" transition:slide={{ duration: 150 }}>
					<div
						class="flex items-center gap-3 rounded-lg border border-[var(--sl-border)] bg-[var(--sl-bg-surface)] px-4 py-3"
					>
						<Mouse size={16} class="shrink-0 text-[var(--sl-text-3)]" />
						<p class="flex-1 text-[0.8125rem] text-[var(--sl-text-2)]">
							Click a device card to view and manage its settings
						</p>
						<button
							class="btn text-[var(--sl-text-3)] btn-ghost btn-xs"
							onclick={() => {
								sessionDismissedNudge = true;
							}}>Dismiss</button
						>
						<label class="flex items-center gap-1.5">
							<input
								type="checkbox"
								class="checkbox border-slate-500 checkbox-xs checkbox-primary"
								onchange={() => {
									preferences.showDashboardNudge = false;
								}}
							/>
							<span class="text-xs text-[var(--sl-text-3)]">Don't show again</span>
						</label>
					</div>
				</div>
			{/if}

			<div class="mb-3 flex items-center justify-between px-4">
				<h2 class="text-xs font-semibold tracking-[0.2em] text-[var(--sl-text-3)] uppercase">
					Devices
				</h2>
				<RefreshIndicator />
			</div>

			{#snippet statCell(
				label: string,
				value: string | null,
				mono: boolean,
				loading: boolean
			)}
				<div
					class="flex min-w-0 flex-col gap-1 rounded-lg bg-[var(--sl-bg-elevated)]/40 px-2 py-2"
				>
					<span
						class="text-[0.625rem] font-semibold tracking-wider text-[var(--sl-text-3)] uppercase"
						>{label}</span
					>
					{#key value}
						{#if value}
							<span
								class="value-fade-in truncate text-[0.75rem] font-medium text-[var(--sl-text-1)] {mono
									? 'font-mono'
									: ''}">{value}</span
							>
						{:else if loading}
							<span class="skeleton-bar w-12" aria-hidden="true"></span>
						{:else}
							<span class="text-[0.75rem] text-[var(--sl-text-3)]">—</span>
						{/if}
					{/key}
				</div>
			{/snippet}

			{#snippet detailRow(
				label: string,
				value: string | null,
				mono: boolean,
				loading: boolean
			)}
				<div class="flex items-center gap-3">
					<span class="w-16 shrink-0 text-[0.75rem] text-[var(--sl-text-3)]">{label}</span>
					{#key value}
						{#if value}
							<span
								class="value-fade-in truncate text-[0.75rem] text-[var(--sl-text-2)] {mono
									? 'font-mono'
									: ''}">{value}</span
							>
						{:else if loading}
							<span class="skeleton-bar w-24" aria-hidden="true"></span>
						{:else}
							<span class="text-[0.75rem] text-[var(--sl-text-3)]">—</span>
						{/if}
					{/key}
				</div>
			{/snippet}

			<div class="flex flex-col gap-3" role="list" aria-label="Device list">
				{#each onlineDevices as device (device.device_id)}
					{@const isLoading =
						!deviceState.onlineStatuses[device.device_id] ||
						deviceState.onlineStatuses[device.device_id] === 'loading'}
					{@const isUnregistered =
						device.comma_dongle_id?.toLowerCase().replace(/\s/g, '') === 'unregistereddevice'}
					{@const isRenaming = renamingDeviceId === device.device_id}
					{@const isSelected = deviceState.selectedDeviceId === device.device_id}

					<article
						class="group overflow-hidden rounded-xl border bg-[var(--sl-bg-surface)] transition-[border-color,background-color,box-shadow] duration-150 hover:bg-[var(--sl-bg-elevated)]/30 hover:shadow-sm {isSelected
							? 'border-2 border-primary bg-primary/[0.03] dark:bg-primary/[0.06]'
							: 'border border-[var(--sl-border)] hover:border-[var(--sl-text-3)]/30'}"
						onclick={() => handleDeviceClick(device)}
						onkeydown={(e) => {
							if (e.key === 'Enter' || e.key === ' ') {
								e.preventDefault();
								handleDeviceClick(device);
							}
						}}
						role="listitem"
						tabindex="0"
						aria-label="{getAlias(device)} - {getStatusText(device)}"
						aria-busy={isLoading ? 'true' : undefined}
					>
						<!-- Tri-segment status stripe: connection · driving · pending -->
						<div class="flex h-1 w-full" aria-hidden="true">
							<span class="flex-1 {getConnectionSegColor(device)}"></span>
							<span class="flex-1 {getDrivingSegColor(device)}"></span>
							<span class="flex-1 {getPendingSegColor(device)}"></span>
						</div>

						<div class="flex items-start gap-3 px-4 py-3.5">
							<div class="min-w-0 flex-1">
								<!-- Alias + rename pencil + live loader -->
								<div class="flex items-center gap-2">
									{#if isRenaming}
										<input
											id="alias-{device.device_id}"
											type="text"
											value={getAlias(device)}
											oninput={(e) => handleAliasChange(device, e.currentTarget.value)}
											onblur={() => {
												renamingDeviceId = null;
											}}
											onkeydown={(e) => {
												if (e.key === 'Enter' || e.key === 'Escape') {
													renamingDeviceId = null;
												}
											}}
											onclick={(e) => e.stopPropagation()}
											class="min-w-0 flex-1 rounded border border-primary/50 bg-[var(--sl-bg-input)] px-2 py-0.5 text-sm font-medium text-[var(--sl-text-1)] focus:border-primary focus:outline-none"
										/>
									{:else}
										<span class="truncate text-sm font-medium text-[var(--sl-text-1)]">
											{getAlias(device)}
										</span>
										<button
											type="button"
											class="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-[var(--sl-text-3)] transition-colors hover:bg-[var(--sl-bg-elevated)] hover:text-[var(--sl-text-1)] focus-visible:bg-[var(--sl-bg-elevated)] focus-visible:outline-none"
											onclick={(e) => {
												e.stopPropagation();
												startRename(device.device_id);
											}}
											onkeydown={(e) => e.stopPropagation()}
											aria-label="Rename {getAlias(device)}"
										>
											<Pencil size={12} />
										</button>
									{/if}
									{#if isLoading}
										<Loader2
											size={12}
											class="shrink-0 animate-spin text-[var(--sl-text-3)]"
											aria-label="Checking status"
										/>
									{/if}
								</div>

								<!-- Substatus caption -->
								<p class="mt-0.5 text-[0.75rem] text-[var(--sl-text-3)]">
									{getSubtitle(device) || getStatusText(device)}
								</p>

								<!-- Primary 3-column stat strip: Version · Branch · Last seen -->
								<div class="mt-3 grid grid-cols-3 gap-2">
									{@render statCell('Version', getVersion(device), false, isLoading)}
									{@render statCell('Branch', getBranch(device), true, isLoading)}
									{@render statCell(
										'Last seen',
										formatLastSeenShort(device, statusPolling.tickCounter),
										false,
										isLoading
									)}
								</div>

								<!-- Secondary rows: stable slots with "—" fallback so layout never shifts -->
								<div class="mt-3 max-w-[280px] space-y-1.5">
									{@render detailRow('Device', getDeviceTypeName(device), false, isLoading)}
									{@render detailRow('Network', getNetworkType(device), false, isLoading)}
									{@render detailRow('Commit', getCommit(device), true, isLoading)}
								</div>
							</div>

							<div
								class="shrink-0 pt-0.5"
								onclick={(e) => e.stopPropagation()}
								onkeydown={(e) => e.stopPropagation()}
							>
								<DeviceRowMenu
									deviceId={device.device_id}
									dongleId={isUnregistered ? undefined : device.comma_dongle_id}
									pairedAt={device.created_at}
									isDownloading={deviceState.backupState.isDownloading &&
										deviceState.backupState.deviceId === device.device_id}
									onRename={() => startRename(device.device_id)}
									onDownloadBackup={() => handleDownloadBackup(device.device_id)}
									onDeregister={() => openDeregisterModal(device)}
								/>
							</div>
						</div>
					</article>
				{/each}

				{#if offlineDevices.length > 0}
					<button
						class="flex w-full items-center justify-between rounded-lg px-3 py-2 text-left transition-colors hover:bg-[var(--sl-bg-elevated)]/30"
						onclick={() => (offlineSectionOpen = !offlineSectionOpen)}
						aria-expanded={offlineSectionOpen}
					>
						<span class="text-xs text-[var(--sl-text-3)]">
							Offline · {offlineDevices.length} device{offlineDevices.length === 1 ? '' : 's'}
						</span>
						{#if offlineSectionOpen}
							<ChevronDown size={14} class="text-[var(--sl-text-3)]" />
						{:else}
							<ChevronRight size={14} class="text-[var(--sl-text-3)]" />
						{/if}
					</button>

					{#if offlineSectionOpen}
						<div class="flex flex-col gap-3" transition:slide={{ duration: 150 }}>
							{#each offlineDevices as device (device.device_id)}
								{@const isUnregistered =
									device.comma_dongle_id?.toLowerCase().replace(/\s/g, '') === 'unregistereddevice'}
								{@const isRenaming = renamingDeviceId === device.device_id}
								{@const isSelected = deviceState.selectedDeviceId === device.device_id}

								<article
									class="group overflow-hidden rounded-xl border bg-[var(--sl-bg-surface)] transition-[border-color,background-color,box-shadow] duration-150 hover:bg-[var(--sl-bg-elevated)]/30 hover:shadow-sm {isSelected
										? 'border-2 border-primary bg-primary/[0.03] dark:bg-primary/[0.06]'
										: 'border border-[var(--sl-border)] hover:border-[var(--sl-text-3)]/30'}"
									onclick={() => handleDeviceClick(device)}
									onkeydown={(e) => {
										if (e.key === 'Enter' || e.key === ' ') {
											e.preventDefault();
											handleDeviceClick(device);
										}
									}}
									role="listitem"
									tabindex="0"
									aria-label="{getAlias(device)} - Offline"
								>
									<!-- Tri-segment status stripe: connection · driving · pending -->
									<div class="flex h-1 w-full" aria-hidden="true">
										<span class="flex-1 {getConnectionSegColor(device)}"></span>
										<span class="flex-1 {getDrivingSegColor(device)}"></span>
										<span class="flex-1 {getPendingSegColor(device)}"></span>
									</div>

									<div class="flex items-start gap-3 px-4 py-3.5">
										<div class="min-w-0 flex-1">
											<div class="flex items-center gap-2">
												{#if isRenaming}
													<input
														id="alias-{device.device_id}"
														type="text"
														value={getAlias(device)}
														oninput={(e) => handleAliasChange(device, e.currentTarget.value)}
														onblur={() => {
															renamingDeviceId = null;
														}}
														onkeydown={(e) => {
															if (e.key === 'Enter' || e.key === 'Escape') {
																renamingDeviceId = null;
															}
														}}
														onclick={(e) => e.stopPropagation()}
														class="min-w-0 flex-1 rounded border border-primary/50 bg-[var(--sl-bg-input)] px-2 py-0.5 text-sm font-medium text-[var(--sl-text-1)] focus:border-primary focus:outline-none"
													/>
												{:else}
													<span class="truncate text-sm font-medium text-[var(--sl-text-1)]">
														{getAlias(device)}
													</span>
													<button
														type="button"
														class="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-[var(--sl-text-3)] transition-colors hover:bg-[var(--sl-bg-elevated)] hover:text-[var(--sl-text-1)] focus-visible:bg-[var(--sl-bg-elevated)] focus-visible:outline-none"
														onclick={(e) => {
															e.stopPropagation();
															startRename(device.device_id);
														}}
														onkeydown={(e) => e.stopPropagation()}
														aria-label="Rename {getAlias(device)}"
													>
														<Pencil size={12} />
													</button>
												{/if}
											</div>

											<p class="mt-0.5 text-[0.75rem] text-[var(--sl-text-3)]">Offline</p>

											<div class="mt-3 grid grid-cols-3 gap-2">
												{@render statCell('Version', getVersion(device), false, false)}
												{@render statCell('Branch', getBranch(device), true, false)}
												{@render statCell(
													'Last seen',
													formatLastSeenShort(device, statusPolling.tickCounter),
													false,
													false
												)}
											</div>

											<div class="mt-3 max-w-[280px] space-y-1.5">
												{@render detailRow('Device', getDeviceTypeName(device), false, false)}
												{@render detailRow('Commit', getCommit(device), true, false)}
											</div>
										</div>

										<div
											class="shrink-0 pt-0.5"
											onclick={(e) => e.stopPropagation()}
											onkeydown={(e) => e.stopPropagation()}
										>
											<DeviceRowMenu
												deviceId={device.device_id}
												dongleId={isUnregistered ? undefined : device.comma_dongle_id}
												pairedAt={device.created_at}
												onRename={() => startRename(device.device_id)}
												onDeregister={() => openDeregisterModal(device)}
											/>
										</div>
									</div>
								</article>
							{/each}
						</div>
					{/if}
				{/if}
			</div>

			<button
				class="group mt-4 flex w-full items-center gap-4 rounded-xl border border-dashed border-[var(--sl-border)] px-4 py-3.5 text-left transition-colors hover:border-[var(--sl-text-3)]/50 hover:bg-[var(--sl-bg-surface)]/50"
				onclick={() => deviceState.openPairingModal()}
			>
				<div
					class="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-dashed border-[var(--sl-text-3)]/50 text-[var(--sl-text-3)] transition-colors group-hover:border-[var(--sl-text-2)] group-hover:text-[var(--sl-text-2)]"
				>
					<Plus size={16} />
				</div>
				<p
					class="text-sm text-[var(--sl-text-3)] transition-colors group-hover:text-[var(--sl-text-2)]"
				>
					Pair New Device
				</p>
			</button>
		{/if}

		{#if pendingChanges.length > 0}
			<div
				class="animate-in slide-in-from-bottom-4 fade-in fixed bottom-6 left-1/2 z-40 w-full max-w-xl -translate-x-1/2 px-4 duration-300"
			>
				<div
					class="flex items-center justify-between gap-4 rounded-xl border border-[var(--sl-border)] bg-[var(--sl-bg-elevated)]/95 p-4 shadow-2xl backdrop-blur-md"
				>
					<div class="flex items-center gap-3">
						<Save size={18} class="text-primary" />
						<div>
							<p class="text-sm font-medium text-[var(--sl-text-1)]">Unsaved Changes</p>
							<p class="text-xs text-[var(--sl-text-3)]">
								{pendingChanges.length} alias{pendingChanges.length === 1 ? '' : 'es'} modified
							</p>
						</div>
					</div>
					<div class="flex items-center gap-2">
						<button
							class="btn text-[var(--sl-text-3)] btn-ghost btn-sm hover:text-[var(--sl-text-1)]"
							onclick={() => deviceState.clearAliasOverrides()}
						>
							Discard
						</button>
						<button class="btn btn-sm btn-primary" onclick={() => (updateAliasModalOpen = true)}>
							Save
						</button>
					</div>
				</div>
			</div>

			<UpdateAliasModal bind:open={updateAliasModalOpen} changes={pendingChanges} />
		{/if}

		{#if deviceToDeregister}
			<DeregisterDeviceModal
				bind:open={deregisterModalOpen}
				deviceId={deviceToDeregister}
				alias={deviceToDeregisterAlias}
				pairedAt={deviceToDeregisterPairedAt}
				isOnline={deviceToDeregisterIsOnline}
				onDeregistered={() => {
					window.location.reload();
				}}
			/>
		{/if}
	</div>
{/if}

<BackupProgressModal
	onRetry={handleRetryFailedBackup}
	onFullBackup={() => {
		const deviceId = deviceState.backupState.deviceId;
		if (deviceId) handleDownloadBackup(deviceId, true);
	}}
/>
