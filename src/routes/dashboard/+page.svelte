<script lang="ts">
	import { goto } from '$app/navigation';
	import { authState, logtoClient } from '$lib/logto/auth.svelte';
	import { deviceState } from '$lib/stores/device.svelte';
	import UpdateAliasModal from '$lib/components/UpdateAliasModal.svelte';
	import DeregisterDeviceModal from '$lib/components/DeregisterDeviceModal.svelte';
	import DashboardSkeleton from './DashboardSkeleton.svelte';
	import DeviceRowMenu from '$lib/components/DeviceRowMenu.svelte';
	import RefreshIndicator from '$lib/components/RefreshIndicator.svelte';
	import { Save, Plus, Loader2, ChevronDown, ChevronRight } from 'lucide-svelte';
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
		if (status === 'error') return 'bg-amber-500/70';
		if (status === 'offline') return 'bg-[var(--sl-text-3)]/50';
		return 'bg-emerald-500/70';
	}

	function handleDeviceClick(device: any) {
		deviceState.setSelectedDevice(device.device_id);
		goto('/dashboard/settings/device');
	}

	// ── Device data ────────────────────────────────────────────────────

	let devices = $state<any[]>([]);

	$effect(() => {
		if (data.streamed.deviceResult) {
			data.streamed.deviceResult.then((result: any) => {
				devices = result.devices || [];
			});
		}
	});

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

{#if authState.loading}
	<DashboardSkeleton />
{:else}
	{#await data.streamed.deviceResult}
		<DashboardSkeleton name={authState.profile?.name ?? undefined} />
	{:then _}
		<div class="mx-auto w-full max-w-3xl pb-24 xl:max-w-4xl">
			{#if !devices || devices.length === 0}
				<!-- Empty state -->
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
				<!-- Section header -->
				<div class="mb-4 flex items-center justify-between">
					<h2 class="text-xs font-semibold tracking-[0.2em] text-[var(--sl-text-3)] uppercase">
						Devices
					</h2>
					<div class="flex items-center gap-2">
						<span class="text-xs text-[var(--sl-text-3)]">
							{devices.length} device{devices.length === 1 ? '' : 's'}
						</span>
						<span class="text-[var(--sl-border)]">·</span>
						<RefreshIndicator />
					</div>
				</div>

				<!-- Unified device list card -->
				<div class="rounded-xl border border-[var(--sl-border)] bg-[var(--sl-bg-surface)]" role="list" aria-label="Device list">
					{#each onlineDevices as device, i (device.device_id)}
						{@const isLoading = !deviceState.onlineStatuses[device.device_id] || deviceState.onlineStatuses[device.device_id] === 'loading'}
						{@const isUnregistered = device.comma_dongle_id?.toLowerCase().replace(/\s/g, '') === 'unregistereddevice'}
						{@const isRenaming = renamingDeviceId === device.device_id}

						<div
							class="group flex items-center gap-3 px-4 py-3.5 transition-colors duration-150 hover:bg-[var(--sl-bg-elevated)]/30"
							onclick={() => handleDeviceClick(device)}
							onkeydown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); handleDeviceClick(device); } }}
							role="listitem"
							tabindex="0"
							aria-label="{getAlias(device)} - {getStatusText(device)}"
							style="cursor: pointer;"
						>
							<!-- Status dot -->
							<span class="block h-[6px] w-[6px] shrink-0 rounded-full {getStatusDotClass(device)}"></span>

							<!-- Name + meta -->
							<div class="min-w-0 flex-1">
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
									{#if isLoading}
										<Loader2 size={12} class="shrink-0 animate-spin text-[var(--sl-text-3)]" />
									{/if}
								</div>
								<div class="mt-0.5 flex items-center gap-1.5 text-xs text-[var(--sl-text-3)]">
									<span>{getStatusText(device)}</span>
									{#if device.created_at}
										<span class="hidden sm:inline">·</span>
										<span class="hidden sm:inline">Paired {formatDateShort(device.created_at)}</span>
									{/if}
								</div>
							</div>

							<!-- Kebab menu -->
							<div class="shrink-0" onclick={(e) => e.stopPropagation()} onkeydown={(e) => e.stopPropagation()}>
								<DeviceRowMenu
									deviceId={device.device_id}
									dongleId={isUnregistered ? undefined : device.comma_dongle_id}
									isDownloading={deviceState.backupState.isDownloading && deviceState.backupState.deviceId === device.device_id}
									onRename={() => startRename(device.device_id)}
									onDownloadBackup={() => handleDownloadBackup(device.device_id)}
									onDeregister={() => openDeregisterModal(device)}
								/>
							</div>
						</div>

						{#if i < onlineDevices.length - 1 || offlineDevices.length > 0}
							<div class="mx-4 border-b border-[var(--sl-border-muted)]"></div>
						{/if}
					{/each}

					<!-- Offline section -->
					{#if offlineDevices.length > 0}
						<button
							class="flex w-full items-center justify-between px-4 py-3 text-left transition-colors hover:bg-[var(--sl-bg-elevated)]/30"
							onclick={() => (offlineSectionOpen = !offlineSectionOpen)}
							aria-expanded={offlineSectionOpen}
						>
							<div class="flex items-center gap-3">
								<span class="block h-[6px] w-[6px] rounded-full bg-[var(--sl-text-3)]/30"></span>
								<span class="text-xs text-[var(--sl-text-3)]">
									Offline · {offlineDevices.length} device{offlineDevices.length === 1 ? '' : 's'}
								</span>
							</div>
							{#if offlineSectionOpen}
								<ChevronDown size={14} class="text-[var(--sl-text-3)]" />
							{:else}
								<ChevronRight size={14} class="text-[var(--sl-text-3)]" />
							{/if}
						</button>

						{#if offlineSectionOpen}
							<div transition:slide={{ duration: 150 }}>
								{#each offlineDevices as device, i (device.device_id)}
									{@const isUnregistered = device.comma_dongle_id?.toLowerCase().replace(/\s/g, '') === 'unregistereddevice'}
									{@const isRenaming = renamingDeviceId === device.device_id}

									<div class="mx-4 border-b border-[var(--sl-border-muted)]"></div>

									<div
										class="group flex items-center gap-3 px-4 py-3.5 opacity-60 transition-colors duration-150 hover:bg-[var(--sl-bg-elevated)]/30 hover:opacity-80"
										onclick={() => handleDeviceClick(device)}
										onkeydown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); handleDeviceClick(device); } }}
										role="listitem"
										tabindex="0"
										aria-label="{getAlias(device)} - Offline"
										style="cursor: pointer;"
									>
										<span class="block h-[6px] w-[6px] shrink-0 rounded-full bg-[var(--sl-text-3)]/30"></span>

										<div class="min-w-0 flex-1">
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
											</div>
											<div class="mt-0.5 flex items-center gap-1.5 text-xs text-[var(--sl-text-3)]">
												<span>Offline</span>
												{#if device.created_at}
													<span class="hidden sm:inline">·</span>
													<span class="hidden sm:inline">Paired {formatDateShort(device.created_at)}</span>
												{/if}
											</div>
										</div>

										<div class="shrink-0" onclick={(e) => e.stopPropagation()} onkeydown={(e) => e.stopPropagation()}>
											<DeviceRowMenu
												deviceId={device.device_id}
												dongleId={isUnregistered ? undefined : device.comma_dongle_id}
												onRename={() => startRename(device.device_id)}
												onDeregister={() => openDeregisterModal(device)}
											/>
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
	{/await}

	<BackupProgressModal
		onRetry={handleRetryFailedBackup}
		onFullBackup={() => {
			const deviceId = deviceState.backupState.deviceId;
			if (deviceId) handleDownloadBackup(deviceId, true);
		}}
	/>
{/if}
