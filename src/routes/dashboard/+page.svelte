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
	import { Save, Plus, Loader2, ChevronDown, ChevronRight, Check } from 'lucide-svelte';
	import { slide } from 'svelte/transition';
	import BackupProgressModal from '$lib/components/BackupProgressModal.svelte';
	import { downloadSettingsBackup, fetchAllSettings } from '$lib/utils/settings';
	import { v1Client } from '$lib/api/client';

	let { data } = $props();

	let updateAliasModalOpen = $state(false);
	let deregisterModalOpen = $state(false);
	let deviceToDeregister = $state<string | null>(null);
	let deviceToDeregisterAlias = $state<string>('');
	let deviceToDeregisterPairedAt = $state<number>(0);
	let deviceToDeregisterIsOnline = $state<boolean>(false);
	let renamingDeviceId = $state<string | null>(null);
	let offlineSectionOpen = $state(false);

	// ── Backup logic ────────────────────────────────────────────────────

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
				deviceId, v1Client, token, currentValues,
				(progress, status) => { deviceState.setBackupProgress(progress, status); },
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
					setTimeout(() => { deviceState.closeBackupModal(); }, 1000);
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
				deviceId, v1Client, token, previousSettings,
				(progress, status) => { deviceState.setBackupProgress(progress, status); },
				deviceState.backupState.abortController?.signal,
				deviceState.deviceSettings[deviceId],
				failedKeyNames
			);

			const mergedSettings = { ...previousSettings, ...result.settings };
			deviceState.setBackupFetchedSettings(mergedSettings);

			if (result.failedKeys.length > 0) {
				deviceState.finishBackup(false, `${result.failedKeys.length} settings still could not be fetched.`, result.failedKeys);
			} else {
				downloadSettingsBackup(deviceId, mergedSettings);
				deviceState.finishBackup(true);
				if (deviceState.backupState.isOpen) {
					setTimeout(() => { deviceState.closeBackupModal(); }, 1000);
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

	// ── Auth guard ──────────────────────────────────────────────────────

	$effect(() => {
		if (!authState.loading && !authState.isAuthenticated) {
			goto('/');
		}
	});

	// ── Helpers ─────────────────────────────────────────────────────────

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
			year: 'numeric', month: 'short', day: 'numeric'
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
				if (input) { input.focus(); input.select(); }
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
		pc: 'PC',
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
		const map: Record<string, string> = { wifi: 'WiFi', cellular: 'Cellular', ethernet: 'Ethernet' };
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
		deviceState.setSelectedDevice(device.device_id);
		goto('/dashboard/settings/device');
	}

	// ── Device data ────────────────────────────────────────────────────

	// Use cached devices from deviceState for instant rendering; update when API returns
	let devices = $derived(deviceState.pairedDevices);

	let onlineDevices = $derived.by(() => {
		deviceState.version;
		if (!devices) return [];
		const list = devices.filter((d) => {
			const status = deviceState.onlineStatuses[d.device_id];
			return status === 'online' || status === 'loading' || status === 'error' || status === undefined;
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

{#if devices.length === 0 && !deviceState.pairedDevicesLoaded}
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
						class="btn btn-sm mt-6 gap-2 border-[var(--sl-border)] bg-[var(--sl-bg-elevated)] text-[var(--sl-text-1)] hover:bg-[var(--sl-bg-subtle)]"
						onclick={() => deviceState.openPairingModal()}
					>
						<Plus size={16} />
						Pair Device
					</button>
				</div>
			{:else}
				<!-- Page header -->
				<div class="mb-6 px-4">
					<h1 class="text-[24px] font-medium leading-[32px] tracking-[-0.16px] text-[var(--sl-text-1)]">
						Dashboard
					</h1>
					<p class="mt-1 text-[0.8125rem] text-[var(--sl-text-2)]">
						{devices.length} device{devices.length === 1 ? '' : 's'}
					</p>
				</div>

				<!-- Section header -->
				<div class="mb-3 flex items-center justify-between px-4">
					<h2 class="text-xs font-semibold tracking-[0.2em] text-[var(--sl-text-3)] uppercase">
						Devices
					</h2>
					<RefreshIndicator />
				</div>

				<!-- Device cards -->
				<div class="flex flex-col gap-3" role="list" aria-label="Device list">
					{#each onlineDevices as device (device.device_id)}
						{@const isLoading = !deviceState.onlineStatuses[device.device_id] || deviceState.onlineStatuses[device.device_id] === 'loading'}
						{@const isUnregistered = device.comma_dongle_id?.toLowerCase().replace(/\s/g, '') === 'unregistereddevice'}
						{@const isRenaming = renamingDeviceId === device.device_id}
						{@const isSelected = deviceState.selectedDeviceId === device.device_id}

						<div
							class="group rounded-xl border-l-[3px] border border-y border-r transition-colors duration-150 hover:bg-[var(--sl-bg-elevated)]/30 {getStripColor(device)} {isSelected ? 'border-y-[var(--sl-border)] border-r-[var(--sl-border)] bg-primary/[0.04] dark:bg-primary/[0.08]' : 'border-y-[var(--sl-border)] border-r-[var(--sl-border)] bg-[var(--sl-bg-surface)]'}"
							onclick={() => handleDeviceClick(device)}
							onkeydown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); handleDeviceClick(device); } }}
							role="listitem"
							tabindex="0"
							aria-label="{getAlias(device)} - {getStatusText(device)}"
						>
							<div class="flex items-start gap-3 px-4 py-4">
								<!-- Name + telemetry -->
								<div class="min-w-0 flex-1">
									<!-- Row 1: Name -->
									<div class="flex items-center gap-2">
										{#if isRenaming}
											<input
												id="alias-{device.device_id}"
												type="text"
												value={getAlias(device)}
												oninput={(e) => handleAliasChange(device, e.currentTarget.value)}
												onblur={() => { renamingDeviceId = null; }}
												onkeydown={(e) => { if (e.key === 'Enter' || e.key === 'Escape') { renamingDeviceId = null; } }}
												onclick={(e) => e.stopPropagation()}
												class="min-w-0 flex-1 rounded border border-primary/50 bg-[var(--sl-bg-input)] px-2 py-0.5 text-sm font-medium text-[var(--sl-text-1)] focus:border-primary focus:outline-none"
											/>
										{:else}
											<span class="truncate text-sm font-medium text-[var(--sl-text-1)]">
												{getAlias(device)}
											</span>
										{/if}
										{#if isSelected}
											<span class="flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-primary text-white">
												<Check size={10} strokeWidth={3} />
											</span>
										{/if}
										{#if isLoading}
											<Loader2 size={12} class="shrink-0 animate-spin text-[var(--sl-text-3)]" />
										{/if}
									</div>

									<!-- Telemetry rows -->
									<div class="mt-3 max-w-[280px] space-y-1.5">
										{#if getDeviceTypeName(device)}
											<div class="flex items-center gap-3">
												<span class="w-16 shrink-0 text-[0.75rem] text-[var(--sl-text-3)]">Device</span>
												<span class="text-[0.75rem] text-[var(--sl-text-2)]">{getDeviceTypeName(device)}</span>
											</div>
										{/if}
										<div class="flex items-center gap-3">
											<span class="w-16 shrink-0 text-[0.75rem] text-[var(--sl-text-3)]">Status</span>
											<span class="text-[0.75rem] text-[var(--sl-text-2)]">{getDrivingState(device) ?? getStatusText(device)}</span>
										</div>
										{#if getVersion(device)}
											<div class="flex items-center gap-3">
												<span class="w-16 shrink-0 text-[0.75rem] text-[var(--sl-text-3)]">Version</span>
												<span class="text-[0.75rem] text-[var(--sl-text-2)]">{getVersion(device)}</span>
											</div>
										{/if}
										{#if getBranch(device)}
											<div class="flex items-center gap-3">
												<span class="w-16 shrink-0 text-[0.75rem] text-[var(--sl-text-3)]">Branch</span>
												<span class="truncate font-mono text-[0.75rem] text-[var(--sl-text-2)]">{getBranch(device)}</span>
											</div>
										{/if}
										{#if getCommit(device)}
											<div class="flex items-center gap-3">
												<span class="w-16 shrink-0 text-[0.75rem] text-[var(--sl-text-3)]">Commit</span>
												<span class="font-mono text-[0.75rem] text-[var(--sl-text-2)]">{getCommit(device)}</span>
											</div>
										{/if}
										{#if getNetworkType(device)}
											<div class="flex items-center gap-3">
												<span class="w-16 shrink-0 text-[0.75rem] text-[var(--sl-text-3)]">Network</span>
												<span class="text-[0.75rem] text-[var(--sl-text-2)]">{getNetworkType(device)}</span>
											</div>
										{/if}
										{#if getLastSeen(device)}
											<div class="flex items-center gap-3">
												<span class="w-16 shrink-0 text-[0.75rem] text-[var(--sl-text-3)]">Last seen</span>
												{#key statusPolling.tickCounter}
													<span class="text-[0.75rem] text-[var(--sl-text-2)]">{formatRelativeTime(getLastSeen(device)!)}</span>
												{/key}
											</div>
										{/if}
									</div>
								</div>

								<!-- Kebab menu -->
								<div class="shrink-0 pt-0.5" onclick={(e) => e.stopPropagation()} onkeydown={(e) => e.stopPropagation()}>
									<DeviceRowMenu
										deviceId={device.device_id}
										dongleId={isUnregistered ? undefined : device.comma_dongle_id}
										pairedAt={device.created_at}
										isDownloading={deviceState.backupState.isDownloading && deviceState.backupState.deviceId === device.device_id}
										onRename={() => startRename(device.device_id)}
										onDownloadBackup={() => handleDownloadBackup(device.device_id)}
										onDeregister={() => openDeregisterModal(device)}
									/>
								</div>
							</div>
						</div>
					{/each}

					<!-- Offline section -->
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
									{@const isUnregistered = device.comma_dongle_id?.toLowerCase().replace(/\s/g, '') === 'unregistereddevice'}
									{@const isRenaming = renamingDeviceId === device.device_id}
									{@const isSelected = deviceState.selectedDeviceId === device.device_id}

									<div
										class="group rounded-xl border-l-[3px] border border-y border-r border-l-[var(--sl-text-3)]/20 transition-colors duration-150 hover:bg-[var(--sl-bg-elevated)]/30 {isSelected ? 'border-y-[var(--sl-border)] border-r-[var(--sl-border)] bg-primary/[0.04] dark:bg-primary/[0.08]' : 'border-y-[var(--sl-border)] border-r-[var(--sl-border)] bg-[var(--sl-bg-surface)]'}"
										onclick={() => handleDeviceClick(device)}
										onkeydown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); handleDeviceClick(device); } }}
										role="listitem"
										tabindex="0"
										aria-label="{getAlias(device)} - Offline"
												>
										<div class="flex items-start gap-3 px-4 py-4">
											<div class="min-w-0 flex-1">
												<!-- Row 1: Name -->
												<div class="flex items-center gap-2">
													{#if isRenaming}
														<input
															id="alias-{device.device_id}"
															type="text"
															value={getAlias(device)}
															oninput={(e) => handleAliasChange(device, e.currentTarget.value)}
															onblur={() => { renamingDeviceId = null; }}
															onkeydown={(e) => { if (e.key === 'Enter' || e.key === 'Escape') { renamingDeviceId = null; } }}
															onclick={(e) => e.stopPropagation()}
															class="min-w-0 flex-1 rounded border border-primary/50 bg-[var(--sl-bg-input)] px-2 py-0.5 text-sm font-medium text-[var(--sl-text-1)] focus:border-primary focus:outline-none"
														/>
													{:else}
														<span class="truncate text-sm font-medium text-[var(--sl-text-1)]">
															{getAlias(device)}
														</span>
													{/if}
													{#if isSelected}
														<span class="flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-primary text-white">
															<Check size={10} strokeWidth={3} />
														</span>
													{/if}
												</div>

												<!-- Telemetry rows -->
												<div class="mt-3 max-w-[280px] space-y-1.5">
													{#if getDeviceTypeName(device)}
														<div class="flex items-center gap-3">
															<span class="w-16 shrink-0 text-[0.75rem] text-[var(--sl-text-3)]">Device</span>
															<span class="text-[0.75rem] text-[var(--sl-text-2)]">{getDeviceTypeName(device)}</span>
														</div>
													{/if}
													<div class="flex items-center gap-3">
														<span class="w-16 shrink-0 text-[0.75rem] text-[var(--sl-text-3)]">Status</span>
														<span class="text-[0.75rem] text-[var(--sl-text-2)]">Offline</span>
													</div>
													{#if getBranch(device)}
														<div class="flex items-center gap-3">
															<span class="w-16 shrink-0 text-[0.75rem] text-[var(--sl-text-3)]">Branch</span>
															<span class="truncate font-mono text-[0.75rem] text-[var(--sl-text-2)]">{getBranch(device)}</span>
														</div>
													{/if}
													{#if getCommit(device)}
														<div class="flex items-center gap-3">
															<span class="w-16 shrink-0 text-[0.75rem] text-[var(--sl-text-3)]">Commit</span>
															<span class="font-mono text-[0.75rem] text-[var(--sl-text-2)]">{getCommit(device)}</span>
														</div>
													{/if}
													{#if getLastSeen(device)}
														<div class="flex items-center gap-3">
															<span class="w-16 shrink-0 text-[0.75rem] text-[var(--sl-text-3)]">Last seen</span>
															{#key statusPolling.tickCounter}
																<span class="text-[0.75rem] text-[var(--sl-text-2)]">{formatRelativeTime(getLastSeen(device)!)}</span>
															{/key}
														</div>
													{/if}
												</div>
											</div>

											<div class="shrink-0 pt-0.5" onclick={(e) => e.stopPropagation()} onkeydown={(e) => e.stopPropagation()}>
												<DeviceRowMenu
													deviceId={device.device_id}
													dongleId={isUnregistered ? undefined : device.comma_dongle_id}
													pairedAt={device.created_at}
													onRename={() => startRename(device.device_id)}
													onDeregister={() => openDeregisterModal(device)}
												/>
											</div>
										</div>
									</div>
								{/each}
							</div>
						{/if}
					{/if}
				</div>

				<!-- Pair New Device -->
				<button
					class="group mt-4 flex w-full items-center gap-4 rounded-xl border border-dashed border-[var(--sl-border)] px-4 py-3.5 text-left transition-colors hover:border-[var(--sl-text-3)]/50 hover:bg-[var(--sl-bg-surface)]/50"
					onclick={() => deviceState.openPairingModal()}
				>
					<div class="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-dashed border-[var(--sl-text-3)]/50 text-[var(--sl-text-3)] transition-colors group-hover:border-[var(--sl-text-2)] group-hover:text-[var(--sl-text-2)]">
						<Plus size={16} />
					</div>
					<p class="text-sm text-[var(--sl-text-3)] transition-colors group-hover:text-[var(--sl-text-2)]">Pair New Device</p>
				</button>
			{/if}

			<!-- Unsaved Changes Bar -->
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
							<button
								class="btn btn-sm btn-primary"
								onclick={() => (updateAliasModalOpen = true)}
							>
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
					onDeregistered={() => { window.location.reload(); }}
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
