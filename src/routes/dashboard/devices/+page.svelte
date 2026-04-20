<script lang="ts">
	import { goto } from '$app/navigation';
	import { authState, logtoClient } from '$lib/logto/auth.svelte';
	import { deviceState } from '$lib/stores/device.svelte';
	import UpdateAliasModal from '$lib/components/UpdateAliasModal.svelte';
	import DeregisterDeviceModal from '$lib/components/DeregisterDeviceModal.svelte';
	import DashboardSkeleton from '../DashboardSkeleton.svelte';
	import DeviceRowMenu from '$lib/components/DeviceRowMenu.svelte';
	import RefreshIndicator from '$lib/components/RefreshIndicator.svelte';
	import { formatRelativeTime } from '$lib/utils/time';
	import { statusPolling } from '$lib/stores/statusPolling.svelte';
	import { Save, Plus, Loader2, ChevronDown, Pencil } from 'lucide-svelte';
	import { slide } from 'svelte/transition';
	import BackupProgressModal from '$lib/components/BackupProgressModal.svelte';
	import { downloadSettingsBackup, fetchAllSettings } from '$lib/utils/settings';
	import { v1Client } from '$lib/api/client';
	import { pendingChanges as pendingChangesStore } from '$lib/stores/pendingChanges.svelte';
	import MarqueeText from '$lib/components/MarqueeText.svelte';

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
		if (offroad?.forceOffroad) return 'Always Offroad';
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

	function selectAndOpen(device: any) {
		deviceState.setSelectedDevice(device.device_id);
		goto('/dashboard');
	}

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
			<div class="mb-6 flex items-end justify-between gap-3 px-4">
				<div>
					<h1
						class="text-[24px] leading-[32px] font-medium tracking-[-0.16px] text-[var(--sl-text-1)]"
					>
						My Devices
					</h1>
					<p class="mt-1 text-[0.8125rem] text-[var(--sl-text-2)]">
						{devices.length} device{devices.length === 1 ? '' : 's'}
					</p>
				</div>
				<RefreshIndicator />
			</div>

			{#snippet labelValueRow(
				label: string,
				value: string | null,
				mono: boolean,
				loading: boolean,
				marquee: boolean = false
			)}
				<div class="flex items-center justify-between gap-3">
					<span class="shrink-0 text-[0.75rem] text-[var(--sl-text-3)]">{label}</span>
					<div class="min-w-0 flex-1 text-right">
						{#key value}
							{#if value}
								{#if marquee}
									<MarqueeText
										text={value}
										mono={mono}
										className="value-fade-in text-[0.8125rem] font-medium text-[var(--sl-text-1)]"
									/>
								{:else}
									<span
										class="value-fade-in inline-block max-w-full truncate align-middle text-[0.8125rem] font-medium text-[var(--sl-text-1)] {mono
											? 'font-mono'
											: ''}">{value}</span
									>
								{/if}
							{:else if loading}
								<span class="skeleton-bar w-20" aria-hidden="true"></span>
							{:else}
								<span class="text-[0.8125rem] text-[var(--sl-text-3)]">—</span>
							{/if}
						{/key}
					</div>
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
						class="group cursor-pointer rounded-xl border bg-[var(--sl-bg-surface)] transition-[border-color,background-color,box-shadow] duration-150 hover:bg-[var(--sl-bg-elevated)]/30 hover:shadow-sm {isSelected
							? 'border-2 border-primary'
							: 'border border-[var(--sl-border)] hover:border-[var(--sl-text-3)]/30'}"
						onclick={() => selectAndOpen(device)}
						onkeydown={(e) => {
							if (e.key === 'Enter' || e.key === ' ') {
								e.preventDefault();
								selectAndOpen(device);
							}
						}}
						role="listitem"
						tabindex="0"
						aria-label="{getAlias(device)} - {getStatusText(device)}"
						aria-busy={isLoading ? 'true' : undefined}
					>
						<div class="px-4 py-3.5">
							<div class="flex items-start gap-3">
								<div class="min-w-0 flex-1">
									<div class="flex items-center gap-2">
										<span
											class="block h-2 w-2 shrink-0 rounded-full {getStatusDotClass(device)}"
											class:animate-pulse={isLoading}
											aria-hidden="true"
										></span>
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
													e.stopPropagation();
													if (e.key === 'Enter' || e.key === 'Escape') {
														e.preventDefault();
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

									<p class="mt-0.5 text-[0.75rem] text-[var(--sl-text-3)]">
										{getSubtitle(device) || getStatusText(device)}
									</p>
								</div>

								<div
									class="shrink-0"
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

							<div
								class="mt-3 space-y-1.5 rounded-lg bg-[var(--sl-bg-elevated)]/50 px-3 py-2.5"
							>
								{@render labelValueRow('Version', getVersion(device), false, true)}
								{@render labelValueRow('Branch', getBranch(device), true, true, true)}
								{#key statusPolling.tickCounter}
									{@render labelValueRow(
										'Last seen',
										formatLastSeenShort(device, statusPolling.tickCounter),
										false,
										true
									)}
								{/key}
								{@render labelValueRow('Device', getDeviceTypeName(device), false, true)}
								{@render labelValueRow('Network', getNetworkType(device), false, true)}
								{@render labelValueRow('Commit', getCommit(device), true, true)}
							</div>
						</div>
					</article>
				{/each}

				{#if offlineDevices.length > 0}
					<button
						class="group flex w-full items-center justify-between rounded-lg border border-[var(--sl-border)] bg-[var(--sl-bg-surface)] px-4 py-3 text-left transition-colors hover:border-[var(--sl-text-3)]/40 hover:bg-[var(--sl-bg-elevated)] focus-visible:border-primary focus-visible:outline-none"
						onclick={() => (offlineSectionOpen = !offlineSectionOpen)}
						aria-expanded={offlineSectionOpen}
						aria-controls="offline-devices-section"
					>
						<div class="flex items-center gap-2">
							<ChevronDown
								size={16}
								class="shrink-0 text-[var(--sl-text-2)] transition-transform duration-200 {offlineSectionOpen
									? ''
									: '-rotate-90'}"
								aria-hidden="true"
							/>
							<span class="text-sm font-medium text-[var(--sl-text-1)]">Offline</span>
							<span
								class="rounded-full bg-[var(--sl-bg-elevated)] px-2 py-0.5 text-[0.6875rem] font-semibold text-[var(--sl-text-2)] group-hover:bg-[var(--sl-bg-subtle)]"
							>
								{offlineDevices.length}
							</span>
						</div>
					</button>

					{#if offlineSectionOpen}
						<div
							id="offline-devices-section"
							class="flex flex-col gap-3"
							transition:slide={{ duration: 150 }}
						>
							{#each offlineDevices as device (device.device_id)}
								{@const isUnregistered =
									device.comma_dongle_id?.toLowerCase().replace(/\s/g, '') === 'unregistereddevice'}
								{@const isRenaming = renamingDeviceId === device.device_id}
								{@const isSelected = deviceState.selectedDeviceId === device.device_id}

								<article
									class="group cursor-pointer rounded-xl border bg-[var(--sl-bg-surface)] transition-[border-color,background-color,box-shadow] duration-150 hover:bg-[var(--sl-bg-elevated)]/30 hover:shadow-sm {isSelected
										? 'border-2 border-primary'
										: 'border border-[var(--sl-border)] hover:border-[var(--sl-text-3)]/30'}"
									onclick={() => selectAndOpen(device)}
									onkeydown={(e) => {
										if (e.key === 'Enter' || e.key === ' ') {
											e.preventDefault();
											selectAndOpen(device);
										}
									}}
									role="listitem"
									tabindex="0"
									aria-label="{getAlias(device)} - Offline"
								>
									<div class="px-4 py-3.5">
										<div class="flex items-start gap-3">
											<div class="min-w-0 flex-1">
												<div class="flex items-center gap-2">
													<span
														class="block h-2 w-2 shrink-0 rounded-full {getStatusDotClass(device)}"
														aria-hidden="true"
													></span>
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
																e.stopPropagation();
																if (e.key === 'Enter' || e.key === 'Escape') {
																	e.preventDefault();
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
											</div>

											<div
												class="shrink-0"
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

										<div
											class="mt-3 space-y-1.5 rounded-lg bg-[var(--sl-bg-elevated)]/50 px-3 py-2.5"
										>
											{@render labelValueRow('Version', getVersion(device), false, false)}
											{@render labelValueRow('Branch', getBranch(device), true, false, true)}
											{#key statusPolling.tickCounter}
												{@render labelValueRow(
													'Last seen',
													formatLastSeenShort(device, statusPolling.tickCounter),
													false,
													false
												)}
											{/key}
											{@render labelValueRow('Device', getDeviceTypeName(device), false, false)}
											{@render labelValueRow('Network', getNetworkType(device), false, false)}
											{@render labelValueRow('Commit', getCommit(device), true, false)}
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
