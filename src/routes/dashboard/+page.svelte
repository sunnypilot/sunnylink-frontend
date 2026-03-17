<script lang="ts">
	import { goto } from '$app/navigation';
	import { authState, logtoClient } from '$lib/logto/auth.svelte';
	import { deviceState } from '$lib/stores/device.svelte';
	import { checkDeviceStatus } from '$lib/api/device';
	import UpdateAliasModal from '$lib/components/UpdateAliasModal.svelte';
	import DeregisterDeviceModal from '$lib/components/DeregisterDeviceModal.svelte';
	import PairingModal from '$lib/components/PairingModal.svelte';
	import DashboardSkeleton from './DashboardSkeleton.svelte';
	import {
		Wifi,
		WifiOff,
		Activity,
		Cpu,
		Save,
		X,
		Loader2,
		ChevronDown,
		ChevronRight,
		Calendar,
		Copy,
		Check,
		Trash2,
		Download,
		TriangleAlert,
		Plus
	} from 'lucide-svelte';
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
	let offlineSectionOpen = $state(false);
	let copiedDeviceId = $state<string | null>(null);
	let pairingModalOpen = $state(false);
	let pairingType = $state<'c3' | 'c4' | null>(null);

	async function handleDownloadBackup(deviceId: string, fullRefresh: boolean = false) {
		if (!deviceId || deviceState.backupState.isDownloading) return;

		// If there's a previous partial backup for this device, clear it for full refresh
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

			// Update store with any new values fetched
			Object.entries(result.settings).forEach(([key, value]) => {
				if (currentValues[key] === undefined) {
					if (!deviceState.deviceValues[deviceId]) deviceState.deviceValues[deviceId] = {};
					(deviceState.deviceValues[deviceId] as Record<string, unknown>)[key] = value;
				}
			});

			deviceState.setBackupFetchedSettings(result.settings);

			if (result.failedKeys.length > 0) {
				// Show failure summary — let user decide via modal
				deviceState.finishBackup(
					false,
					`${result.failedKeys.length} of ${Object.keys(result.settings).length + result.failedKeys.length} settings could not be fetched.`,
					result.failedKeys
				);
			} else {
				downloadSettingsBackup(deviceId, result.settings);
				deviceState.finishBackup(true);

				// Keep modal open briefly to show completion if it's open
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
				alert('Failed to download backup. Please try again.');
			}
		}
	}

	async function handleRetryFailedBackup() {
		const bs = deviceState.backupState;
		if (!bs.deviceId || !bs.failedKeys.length || !bs.fetchedSettings) return;

		// Capture values before startBackup() resets them
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

			// Merge newly fetched settings
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

	// When modal closes (saved or cancelled), remove focus from any active element
	$effect(() => {
		if (!updateAliasModalOpen && !deregisterModalOpen) {
			if (typeof document !== 'undefined' && document.activeElement instanceof HTMLElement) {
				document.activeElement.blur();
			}
		}
	});

	function handleAliasChange(device: any, newAlias: string) {
		if (!newAlias.trim()) return;
		const originalAlias = deviceState.aliases[device.device_id] ?? device.alias ?? device.device_id;
		deviceState.setAliasOverride(device.device_id, newAlias, originalAlias);
	}

	function getAlias(device: any) {
		// Priority: Unsaved override > Saved store alias > Device alias > Device ID
		return (
			deviceState.aliasOverrides[device.device_id] ??
			deviceState.aliases[device.device_id] ??
			device.alias ??
			device.device_id
		);
	}

	function getPendingChanges(devices: any[]) {
		return Object.entries(deviceState.aliasOverrides)
			.map(([deviceId, newAlias]) => {
				const device = devices.find((d) => d.device_id === deviceId);
				const oldAlias = deviceState.aliases[deviceId] ?? device?.alias ?? deviceId;
				if (newAlias === oldAlias) return null;
				return { deviceId, oldAlias, newAlias };
			})
			.filter((c) => c !== null) as Array<{
			deviceId: string;
			oldAlias: string;
			newAlias: string;
		}>;
	}

	function clearChanges() {
		deviceState.clearAliasOverrides();
	}

	function formatDate(timestamp: number | undefined) {
		if (!timestamp) return 'Unknown';
		return new Date(timestamp * 1000).toLocaleDateString(undefined, {
			year: 'numeric',
			month: 'long',
			day: 'numeric'
		});
	}

	function copyToClipboard(text: string, deviceId: string) {
		navigator.clipboard.writeText(text);
		copiedDeviceId = deviceId;
		setTimeout(() => {
			if (copiedDeviceId === deviceId) {
				copiedDeviceId = null;
			}
		}, 2000);
	}

	function openDeregisterModal(device: any, isOnline: boolean) {
		deviceToDeregister = device.device_id;
		deviceToDeregisterAlias = getAlias(device);
		deviceToDeregisterPairedAt = device.created_at;
		deviceToDeregisterIsOnline = isOnline;
		deregisterModalOpen = true;
	}

	let devices = $state<any[]>([]);

	$effect(() => {
		if (data.streamed.devices) {
			data.streamed.devices.then((d) => {
				devices = d || [];
			});
		}
	});

	let onlineDevices = $derived.by(() => {
		deviceState.version; // Dependency
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
		deviceState.version; // Dependency
		if (!devices) return [];
		const list = devices.filter((d) => deviceState.onlineStatuses[d.device_id] === 'offline');
		return deviceState.sortDevices(list);
	});
</script>

{#if authState.loading}
	<DashboardSkeleton />
{:else}
	{#await data.streamed.devices}
		<DashboardSkeleton name={authState.profile?.name ?? undefined} />
	{:then _}
		<div class="stagger-children space-y-4 pb-24 sm:space-y-6 lg:space-y-8">
			<!-- Header Card -->
			<div class="card border border-[var(--sl-border)] bg-[var(--sl-bg-page)]">
				<div class="card-body p-4 sm:p-6 lg:p-8">
					<div
						class="flex flex-col gap-4 sm:gap-6 lg:flex-row lg:items-start lg:justify-between lg:gap-8"
					>
						<div class="max-w-2xl space-y-3 sm:space-y-4">
							<p class="text-xs tracking-[0.3em] text-[var(--sl-text-2)] uppercase">Daily sunnypilot</p>
							<h1 class="text-2xl font-bold text-[var(--sl-text-1)] sm:text-3xl md:text-4xl lg:text-5xl">
								Hi {authState.profile?.name || 'there'}!
							</h1>
							<p class="text-lg text-[var(--sl-text-2)] sm:text-xl">
								Here's your latest sunnypilot snapshot
							</p>
							<p class="text-sm text-[var(--sl-text-2)] sm:text-base">
								Dive in to see new routes, backups, and model insights. Everything you need, all in
								one place.
							</p>
						</div>

						<div class="grid w-full grid-cols-1 gap-4 sm:grid-cols-2 lg:max-w-none xl:max-w-2xl">
							<!-- Migration CTA -->
							<div
								class="flex w-full flex-col items-start justify-between gap-4 rounded-xl border border-blue-500/20 bg-blue-500/10 p-4"
							>
								<div class="space-y-2">
									<h3 class="font-bold text-blue-400">Device Migration Wizard</h3>
									<p class="text-sm text-[var(--sl-text-2)]">
										Whether you have your new device or are waiting for it to arrive, you can start
										your settings migration now and resume it later.
									</p>
								</div>
								<button
									class="btn btn-sm btn-primary"
									onclick={() => deviceState.openMigrationWizard()}
								>
									Open Migration Wizard
								</button>
							</div>

							<!-- Pair Device CTA -->
							<div
								class="flex w-full flex-col items-start justify-between gap-4 rounded-xl border border-primary/20 bg-primary/10 p-4"
							>
								<div class="space-y-2">
									<h3 class="font-bold text-[var(--sl-text-1)]">Add a Device</h3>
									<p class="text-sm text-[var(--sl-text-2)]">Learn how to pair your device with sunnylink</p>
								</div>
								<div class="flex w-full gap-2">
									<button
										class="btn flex-1 btn-sm btn-primary"
										onclick={() => {
											pairingType = 'c4';
											pairingModalOpen = true;
										}}
									>
										comma four
									</button>
									<button
										class="btn flex-1 btn-sm btn-primary"
										onclick={() => {
											pairingType = 'c3';
											pairingModalOpen = true;
										}}
									>
										comma 3X
									</button>
								</div>
							</div>
						</div>
					</div>
				</div>
			</div>

			{#if !deviceState.selectedDeviceId && devices.length > 0}
				<div class="rounded-xl border border-blue-500/20 bg-blue-500/10 p-4">
					<div class="flex items-start gap-3">
						<div class="mt-0.5 text-blue-400">
							<Activity size={20} />
						</div>
						<div>
							<h3 class="font-medium text-blue-400">Select a Device</h3>
							<p class="text-sm text-[var(--sl-text-2)]">
								Please select a device from the list below to manage its settings, view models, and
								access other features.
							</p>
						</div>
					</div>
				</div>
			{/if}

			{#if !devices || devices.length === 0}
				<div class="card mt-2 border border-[var(--sl-border)] bg-[var(--sl-bg-page)]">
					<div class="card-body p-4 sm:p-6 lg:p-8">
						<div class="flex flex-col items-center justify-center py-12 text-center">
							<div class="mb-4 rounded-full bg-[var(--sl-bg-elevated)]/50 p-4">
								<Cpu class="h-12 w-12 text-[var(--sl-text-2)]" />
							</div>
							<h3 class="text-xl font-semibold text-[var(--sl-text-1)] sm:text-2xl lg:text-3xl">
								No Devices Found
							</h3>
							<p class="mt-2 text-sm text-[var(--sl-text-2)]">
								Pair a device to get started with sunnypilot.
							</p>
							<button class="btn mt-6 gap-2 btn-primary" onclick={() => (pairingModalOpen = true)}>
								<Plus size={20} />
								Pair Device
							</button>
						</div>
					</div>
				</div>
			{:else}
				<!-- Device List -->
				<div class="space-y-6">
					<!-- Online / Checking Devices -->
					{#each onlineDevices as device (device.device_id)}
						{@const status = deviceState.onlineStatuses[device.device_id]}
						{@const isOnline = status === 'online'}
						{@const isLoading = !status || status === 'loading'}
						{@const isUnregistered =
							device.comma_dongle_id?.toLowerCase().replace(/\s/g, '') === 'unregistereddevice'}
						{@const currentAlias = getAlias(device)}
						{@const hasPendingChange = !!deviceState.aliasOverrides[device.device_id]}

						{@const isSelected = deviceState.selectedDeviceId === device.device_id}

						<!-- svelte-ignore a11y_click_events_have_key_events -->
						<!-- svelte-ignore a11y_no_static_element_interactions -->
						<div
							class="card relative cursor-pointer border bg-[var(--sl-bg-page)] transition-all duration-300 hover:border-primary/50 hover:shadow-lg {hasPendingChange
								? 'border-primary ring-1 ring-primary/50'
								: isSelected
									? 'border-primary ring-1 ring-primary/50'
									: 'border-[var(--sl-border)]'}"
							onclick={() => deviceState.setSelectedDevice(device.device_id)}
						>
							<div
								class="flex flex-row items-center justify-between gap-2 border-b border-[var(--sl-border)] bg-[var(--sl-bg-page)]/50 px-4 py-4 sm:gap-4 sm:px-6"
							>
								<div class="flex flex-1 items-center gap-4">
									<!-- Online Status Badge -->
									{#if isLoading}
										<div
											class="flex items-center gap-2 rounded-full bg-[var(--sl-bg-surface)]/50 px-3 py-1 text-xs font-medium text-[var(--sl-text-2)]"
										>
											<Loader2 size={14} class="animate-spin" />
											<span>Checking...</span>
										</div>
									{:else if status === 'error'}
										<div
											class="flex items-center gap-2 rounded-full border border-amber-500/20 bg-amber-500/10 px-3 py-1 text-xs font-medium text-amber-500"
											title={deviceState.lastErrorMessages[device.device_id]}
										>
											<TriangleAlert size={14} />
											<span>Error</span>
										</div>
									{:else}
										<div
											class="flex items-center gap-2 rounded-full border border-emerald-500/20 bg-emerald-500/10 px-3 py-1 text-xs font-medium text-emerald-400"
										>
											<Wifi size={14} />
											<span>Online</span>
										</div>
									{/if}

									<!-- Alias Input -->
									<div class="min-w-0 flex-1">
										<input
											id="alias-{device.device_id}"
											type="text"
											value={currentAlias}
											oninput={(e) => handleAliasChange(device, e.currentTarget.value)}
											onclick={(e) => e.stopPropagation()}
											class="input w-full border-0 bg-transparent px-0 text-base font-bold text-[var(--sl-text-1)] placeholder-slate-600 focus:ring-0 focus:outline-none"
											placeholder={device.device_id}
										/>
									</div>
								</div>

								<div class="flex items-center gap-4">
									<!-- Paired Date -->
									<div class="hidden items-center gap-2 text-xs text-[var(--sl-text-3)] sm:flex">
										<Calendar size={14} />
										<span>Paired {formatDate(device.created_at)}</span>
									</div>

									<!-- Action Buttons -->
									<div class="flex items-center gap-1">
										<button
											class="rounded-lg p-2 min-h-[44px] min-w-[44px] flex items-center justify-center text-[var(--sl-text-2)] transition-all hover:bg-white/5 hover:text-[var(--sl-text-1)]"
											onclick={(e) => {
												e.stopPropagation();
												handleDownloadBackup(device.device_id);
											}}
											title="Download Settings Backup"
											disabled={deviceState.backupState.isDownloading &&
												deviceState.backupState.deviceId === device.device_id}
										>
											{#if deviceState.backupState.isDownloading && deviceState.backupState.deviceId === device.device_id}
												<Loader2 size={20} class="animate-spin" />
											{:else}
												<Download size={20} />
											{/if}
										</button>

										<button
											class="rounded-lg p-2 min-h-[44px] min-w-[44px] flex items-center justify-center text-red-500 transition-all hover:bg-red-500/10 hover:text-red-400"
											onclick={(e) => {
												e.stopPropagation();
												openDeregisterModal(device, isOnline);
											}}
											title="Deregister Device"
										>
											<Trash2 size={20} />
										</button>
									</div>
								</div>
							</div>

							<div class="card-body p-6 lg:p-8">
								<div class="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
									<!-- sunnylink ID Card -->
									<button
										class="group relative rounded-xl border border-[var(--sl-border)] bg-[var(--sl-bg-surface)] p-4 text-left transition-colors hover:border-primary/50 hover:bg-[var(--sl-bg-surface)]/80"
										onclick={(e) => {
											e.stopPropagation();
											copyToClipboard(device.device_id, `id-${device.device_id}`);
										}}
									>
										<span class="mb-2 flex items-center justify-between text-[var(--sl-text-2)]">
											<span class="flex items-center gap-2">
												<Cpu size={18} />
												<span class="text-xs font-bold tracking-wider uppercase">sunnylink ID</span>
											</span>
											{#if copiedDeviceId === `id-${device.device_id}`}
												<Check size={16} class="text-emerald-400" />
											{:else}
												<Copy
													size={16}
													class="opacity-0 transition-opacity group-hover:opacity-100"
												/>
											{/if}
										</span>
										<span class="truncate font-mono text-sm font-bold text-[var(--sl-text-1)]">
											{device.device_id}
										</span>
									</button>

									<!-- Status Card -->
									<div class="rounded-xl border border-[var(--sl-border)] bg-[var(--sl-bg-surface)] p-4">
										<div class="mb-2 flex items-center gap-2 text-[var(--sl-text-2)]">
											<Activity size={18} />
											<span class="text-xs font-bold tracking-wider uppercase">Status</span>
										</div>
										<div class="text-lg font-medium text-[var(--sl-text-1)]">
											{#if isLoading}
												<span class="flex items-center gap-2">
													<Loader2 size={16} class="animate-spin" />
													Checking...
												</span>
											{:else if status === 'error'}
												<span class="text-sm text-amber-500">
													{deviceState.lastErrorMessages[device.device_id] || 'Connection Error'}
												</span>
											{:else}
												Connected
											{/if}
										</div>
									</div>

									<!-- Comma Dongle ID Card -->
									{#if !isUnregistered}
										<button
											class="group relative rounded-xl border border-[var(--sl-border)] bg-[var(--sl-bg-surface)] p-4 text-left transition-colors hover:border-primary/50 hover:bg-[var(--sl-bg-surface)]/80"
											onclick={(e) => {
												e.stopPropagation();
												copyToClipboard(device.comma_dongle_id, device.device_id);
											}}
										>
											<span class="mb-2 flex items-center justify-between text-[var(--sl-text-2)]">
												<span class="flex items-center gap-2">
													<Cpu size={18} />
													<span class="text-xs font-bold tracking-wider uppercase"
														>Comma Dongle ID</span
													>
												</span>
												{#if copiedDeviceId === device.device_id}
													<Check size={16} class="text-emerald-400" />
												{:else}
													<Copy
														size={16}
														class="opacity-0 transition-opacity group-hover:opacity-100"
													/>
												{/if}
											</span>
											<span class="truncate text-xl font-bold text-[var(--sl-text-1)]">
												{device.comma_dongle_id}
											</span>
										</button>
									{/if}
								</div>
							</div>
						</div>
					{/each}

					<!-- Offline Devices Section -->
					{#if offlineDevices.length > 0}
						<div class="rounded-xl border border-[var(--sl-border)] bg-[var(--sl-bg-page)]/50">
							<button
								class="flex w-full items-center justify-between p-4 text-left transition-colors hover:bg-[var(--sl-bg-elevated)]/50"
								onclick={() => (offlineSectionOpen = !offlineSectionOpen)}
							>
								<span class="flex items-center gap-3">
									<span
										class="flex h-8 w-8 items-center justify-center rounded-full bg-[var(--sl-bg-surface)] text-[var(--sl-text-2)]"
									>
										<WifiOff size={16} />
									</span>
									<span>
										<h3 class="font-medium text-[var(--sl-text-2)]">Offline Devices</h3>
										<p class="text-xs text-[var(--sl-text-3)]">
											{offlineDevices.length} device{offlineDevices.length === 1 ? '' : 's'}
										</p>
									</span>
								</span>
								{#if offlineSectionOpen}
									<ChevronDown class="text-[var(--sl-text-3)]" size={20} />
								{:else}
									<ChevronRight class="text-[var(--sl-text-3)]" size={20} />
								{/if}
							</button>

							{#if offlineSectionOpen}
								<div transition:slide class="space-y-4 border-t border-[var(--sl-border)] p-4">
									{#each offlineDevices as device (device.device_id)}
										{@const isUnregistered =
											device.comma_dongle_id?.toLowerCase().replace(/\s/g, '') ===
											'unregistereddevice'}
										{@const currentAlias = getAlias(device)}
										{@const hasPendingChange = !!deviceState.aliasOverrides[device.device_id]}

										<!-- svelte-ignore a11y_click_events_have_key_events -->
										<!-- svelte-ignore a11y_no_static_element_interactions -->
										<div
											class="card relative cursor-pointer border bg-[var(--sl-bg-page)] transition-all duration-300 {hasPendingChange
												? 'border-primary ring-1 ring-primary/50'
												: 'border-[var(--sl-border)]'}"
											onclick={() => deviceState.setSelectedDevice(device.device_id)}
										>
											<div
												class="flex flex-row items-center justify-between gap-2 border-b border-[var(--sl-border)] bg-[var(--sl-bg-page)]/50 px-4 py-4 sm:gap-4 sm:px-6"
											>
												<div class="flex flex-1 items-center gap-4">
													<!-- Offline Status Badge -->
													<div
														class="flex items-center gap-2 rounded-full border border-slate-700 bg-[var(--sl-bg-surface)]/50 px-3 py-1 text-xs font-medium text-[var(--sl-text-2)]"
													>
														<WifiOff size={14} />
														<span>Offline</span>
													</div>

													<!-- Alias Input -->
													<div class="min-w-0 flex-1">
														<input
															id="alias-{device.device_id}"
															type="text"
															value={currentAlias}
															oninput={(e) => handleAliasChange(device, e.currentTarget.value)}
															onclick={(e) => e.stopPropagation()}
															class="input w-full border-0 bg-transparent px-0 text-base font-bold text-[var(--sl-text-1)] placeholder-slate-600 focus:ring-0 focus:outline-none"
															placeholder={device.device_id}
														/>
													</div>
												</div>

												<div class="flex items-center gap-4">
													<!-- Paired Date -->
													<div class="hidden items-center gap-2 text-xs text-[var(--sl-text-3)] sm:flex">
														<Calendar size={14} />
														<span>Paired {formatDate(device.created_at)}</span>
													</div>

													<!-- Trash Icon -->
													<button
														class="rounded-lg p-2 min-h-[44px] min-w-[44px] flex items-center justify-center text-red-500 transition-all hover:bg-red-500/10 hover:text-red-400"
														onclick={(e) => {
															e.stopPropagation();
															openDeregisterModal(device, false);
														}}
														title="Deregister Device"
													>
														<Trash2 size={20} />
													</button>
												</div>
											</div>

											<div class="card-body p-6 lg:p-8">
												<div class="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
													<!-- sunnylink ID Card -->
													<button
														class="group relative rounded-xl border border-[var(--sl-border)] bg-[var(--sl-bg-surface)] p-4 text-left transition-colors hover:border-primary/50 hover:bg-[var(--sl-bg-surface)]/80"
														onclick={(e) => {
															e.stopPropagation();
															copyToClipboard(device.device_id, `id-${device.device_id}`);
														}}
													>
														<span class="mb-2 flex items-center justify-between text-[var(--sl-text-2)]">
															<span class="flex items-center gap-2">
																<Cpu size={18} />
																<span class="text-xs font-bold tracking-wider uppercase"
																	>sunnylink ID</span
																>
															</span>
															{#if copiedDeviceId === `id-${device.device_id}`}
																<Check size={16} class="text-emerald-400" />
															{:else}
																<Copy
																	size={16}
																	class="opacity-0 transition-opacity group-hover:opacity-100"
																/>
															{/if}
														</span>
														<span class="truncate font-mono text-sm font-bold text-[var(--sl-text-1)]">
															{device.device_id}
														</span>
													</button>

													<!-- Status Card (Offline) -->
													<div class="rounded-xl border border-[var(--sl-border)] bg-[var(--sl-bg-surface)] p-4">
														<div class="mb-2 flex items-center gap-2 text-[var(--sl-text-2)]">
															<Activity size={18} />
															<span class="text-xs font-bold tracking-wider uppercase">Status</span>
														</div>
														<div class="text-lg font-medium text-[var(--sl-text-2)]">Disconnected</div>
													</div>

													<!-- Comma Dongle ID Card -->
													{#if !isUnregistered}
														<button
															class="group relative rounded-xl border border-[var(--sl-border)] bg-[var(--sl-bg-surface)] p-4 text-left transition-colors hover:border-primary/50 hover:bg-[var(--sl-bg-surface)]/80"
															onclick={(e) => {
																e.stopPropagation();
																copyToClipboard(device.comma_dongle_id, device.device_id);
															}}
														>
															<span class="mb-2 flex items-center justify-between text-[var(--sl-text-2)]">
																<span class="flex items-center gap-2">
																	<Cpu size={18} />
																	<span class="text-xs font-bold tracking-wider uppercase"
																		>Comma Dongle ID</span
																	>
																</span>
																{#if copiedDeviceId === device.device_id}
																	<Check size={16} class="text-emerald-400" />
																{:else}
																	<Copy
																		size={16}
																		class="opacity-0 transition-opacity group-hover:opacity-100"
																	/>
																{/if}
															</span>
															<span class="truncate text-xl font-bold text-[var(--sl-text-1)]">
																{device.comma_dongle_id}
															</span>
														</button>
													{/if}
												</div>

												<div
													class="mt-6 flex items-center gap-4 rounded-lg border border-red-500/20 bg-red-500/5 p-4"
												>
													<WifiOff class="h-5 w-5 shrink-0 text-red-500" />
													<p class="flex-1 text-sm text-[var(--sl-text-2)]">
														Device is offline. Some features are unavailable.
													</p>
													<button
														class="btn text-red-400 btn-ghost btn-sm hover:bg-red-500/10"
														onclick={async (e) => {
															e.stopPropagation();
															if (logtoClient) {
																const token = await logtoClient.getIdToken();
																if (token) {
																	await checkDeviceStatus(device.device_id, token);
																}
															}
														}}
													>
														Retry
													</button>
												</div>
											</div>
										</div>
									{/each}
								</div>
							{/if}
						</div>
					{/if}
				</div>

				<!-- Unsaved Changes Bar -->
				{@const pendingChanges = getPendingChanges(devices)}
				{#if pendingChanges.length > 0}
					<div
						class="animate-in slide-in-from-bottom-4 fade-in fixed bottom-6 left-1/2 z-40 w-full max-w-2xl -translate-x-1/2 px-4 duration-300"
					>
						<div
							class="flex items-center justify-between gap-4 rounded-xl border border-[var(--sl-border)] bg-[var(--sl-bg-elevated)]/95 p-4 shadow-2xl backdrop-blur-md"
						>
							<div class="flex items-center gap-3">
								<div
									class="flex h-10 w-10 items-center justify-center rounded-full bg-primary/20 text-primary"
								>
									<Save size={20} />
								</div>
								<div>
									<p class="font-medium text-[var(--sl-text-1)]">Unsaved Changes</p>
									<p class="text-xs text-[var(--sl-text-2)]">
										You have modified {pendingChanges.length} device alias{pendingChanges.length ===
										1
											? ''
											: 'es'}.
									</p>
								</div>
							</div>
							<div class="flex items-center gap-2">
								<button
									class="btn text-[var(--sl-text-2)] btn-ghost btn-sm hover:text-[var(--sl-text-1)]"
									onclick={clearChanges}
								>
									Discard
								</button>
								<button
									class="btn btn-sm btn-primary"
									onclick={() => (updateAliasModalOpen = true)}
								>
									Review & Save
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
							// Refresh page or list
							window.location.reload();
						}}
					/>
				{/if}
			{/if}
		</div>
	{/await}

	<button
		class="fixed right-6 bottom-6 z-40 flex h-14 w-14 items-center justify-center rounded-full bg-primary text-[var(--sl-text-1)] shadow-2xl transition-all hover:scale-105 hover:bg-primary/90 hover:shadow-primary/20 active:scale-95 sm:right-10 sm:bottom-10"
		onclick={() => (pairingModalOpen = true)}
		title="Pair New Device"
	>
		<Plus size={28} />
	</button>

	<BackupProgressModal
		onRetry={handleRetryFailedBackup}
		onFullBackup={() => {
			const deviceId = deviceState.backupState.deviceId;
			if (deviceId) handleDownloadBackup(deviceId, true);
		}}
	/>
	<PairingModal bind:open={pairingModalOpen} bind:deviceType={pairingType} />
{/if}
