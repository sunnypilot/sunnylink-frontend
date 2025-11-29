<script lang="ts">
	import { fade, scale } from 'svelte/transition';
	import { goto } from '$app/navigation';
	import {
		Upload,
		ArrowRight,
		Check,
		Loader2,
		X,
		FileJson,
		Smartphone,
		Wifi,
		RefreshCw,
		Download,
		Info,
		ArrowLeftRight,
		Play,
		RotateCcw,
		Minimize2,
		Square
	} from 'lucide-svelte';
	import { deviceState } from '$lib/stores/device.svelte';
	import {
		parseSettingsBackup,
		downloadSettingsBackup,
		fetchAllSettings
	} from '$lib/utils/settings';
	import { v1Client } from '$lib/api/client';
	import { checkDeviceStatus } from '$lib/api/device';
	import { logtoClient } from '$lib/logto/auth.svelte';
	import { decodeParamValue } from '$lib/utils/device';
	import { SETTINGS_DEFINITIONS } from '$lib/types/settings';
	import type { DeviceAuthResponseModel } from '../../sunnylink/types';

	let {
		open = $bindable(false),
		deviceId,
		devices = []
	} = $props<{
		open: boolean;
		deviceId: string;
		devices?: DeviceAuthResponseModel[];
	}>();

	// Use global state
	let ms = $derived(deviceState.migrationState);

	// Initialize target device when modal opens
	// Initialize target device when modal opens
	$effect(() => {
		// Removed auto-selection logic to ensure user explicitly selects a target
	});

	let onlineDevices = $derived.by(() => {
		deviceState.version; // Dependency
		return devices.filter(
			(d: DeviceAuthResponseModel) => deviceState.onlineStatuses[d.device_id || ''] === 'online'
		);
	});

	let sourceDevices = $derived.by(() => {
		// Show all online devices
		return onlineDevices;
	});

	let targetDevices = $derived.by(() => {
		// For target, show all online devices EXCEPT source if in 'new' flow
		if (ms.type === 'new' && ms.sourceDeviceId) {
			return onlineDevices.filter(
				(d: DeviceAuthResponseModel) => d.device_id !== ms.sourceDeviceId
			);
		}
		return onlineDevices;
	});

	let isCheckingStatus = $state(false);

	async function handleRecheckStatus() {
		const token = await logtoClient?.getIdToken();
		if (!token) return;

		isCheckingStatus = true;
		try {
			await Promise.all(
				devices.map((d: DeviceAuthResponseModel) => {
					if (d.device_id) return checkDeviceStatus(d.device_id, token);
					return Promise.resolve();
				})
			);
		} finally {
			isCheckingStatus = false;
		}
	}

	function close() {
		deviceState.closeMigrationWizard();
	}

	function minimize() {
		deviceState.minimizeMigration();
	}

	function cancelFetch() {
		deviceState.cancelMigration();
	}

	async function handleDownloadBackup() {
		// This is the "Download Backup" button in the Intro step.
		// We should use the standard backup flow (BackupProgressModal) for this.
		if (!deviceId) return;

		close(); // Close migration wizard

		// Start standard backup
		deviceState.startBackup(deviceId);
		try {
			const token = await logtoClient?.getIdToken();
			if (!token) throw new Error('Not authenticated');

			const currentValues = deviceState.deviceValues[deviceId] || {};
			const allSettings = await fetchAllSettings(
				deviceId,
				v1Client,
				token,
				currentValues,
				(progress, status) => {
					deviceState.setBackupProgress(progress, status);
				},
				deviceState.backupState.abortController?.signal
			);

			// Update store
			Object.entries(allSettings).forEach(([key, value]) => {
				if (currentValues[key] === undefined) {
					if (!deviceState.deviceValues[deviceId]) deviceState.deviceValues[deviceId] = {};
					(deviceState.deviceValues[deviceId] as Record<string, unknown>)[key] = value;
				}
			});

			downloadSettingsBackup(deviceId, allSettings);
			deviceState.finishBackup(true);
		} catch (e: any) {
			if (e.message === 'Backup cancelled') {
				deviceState.finishBackup(false, 'Backup cancelled');
			} else {
				console.error('Failed to download backup', e);
				deviceState.finishBackup(false, 'Failed to download backup');
			}
		}
	}

	async function handleDownloadFetchedBackup() {
		// This is the "Download Backup" button in Step 3 (Start New flow)
		// We already have the parsed backup in state
		if (!ms.parsedBackup || !ms.sourceDeviceId) return;
		downloadSettingsBackup(ms.sourceDeviceId, ms.parsedBackup.settings);
	}

	async function handleFileUpload(e: Event) {
		const input = e.target as HTMLInputElement;
		if (input.files && input.files[0]) {
			const file = input.files[0];
			deviceState.setMigrationBackupFile(file);

			try {
				const text = await file.text();
				const parsed = parseSettingsBackup(text);
				deviceState.setMigrationParsedBackup(parsed);
				deviceState.setMigrationStep(3); // Go to Target Selection (Resume flow maps to Step 3 logic effectively or we adjust steps)
				// Wait, in previous code Resume flow went to Step 2 (Upload) -> Step 3 (Target).
				// Here:
				// Start New: Step 2 (Source) -> Step 3 (Target/Download) -> Step 4 (Comparison)
				// Resume: Step 2 (Upload) -> Step 3 (Target) -> Step 4 (Comparison)
				// So if we are in Resume (Step 2), uploading file goes to Step 3.
			} catch (err) {
				console.error(err);
				// Handle error (maybe add error state to migrationState or local alert)
				alert('Failed to parse backup file: ' + (err as Error).message);
			}
		}
	}

	async function handleSourceSelection() {
		if (!ms.sourceDeviceId) return;

		const token = await logtoClient?.getIdToken();
		if (!token) return;

		// Trigger background fetch
		deviceState.performMigrationFetch(token);

		// The state update in performMigrationFetch will eventually move us to Step 3
		// But we need to wait? No, performMigrationFetch updates state.
		// However, performMigrationFetch is async.
		// We should probably just let the reactive UI handle the state change.
		// But wait, performMigrationFetch sets step to 3 on success.
		// So we just call it.
	}

	async function prepareComparison() {
		if (!ms.parsedBackup || !ms.targetDeviceId) return;

		deviceState.setMigrationStatus('Fetching target settings...');
		deviceState.setMigrationComparing(true);
		let comparing = true;

		try {
			const token = await logtoClient?.getIdToken();
			if (!token) throw new Error('Not authenticated');

			// Fetch ALL settings from target to ensure we have latest values
			// We use fetchAllSettings which handles chunking and errors
			const currentValues = deviceState.deviceValues[ms.targetDeviceId] || {};

			const targetSettings = await fetchAllSettings(
				ms.targetDeviceId,
				v1Client,
				token,
				currentValues,
				(progress, status) => {
					deviceState.setMigrationStatus(`Fetching target: ${Math.round(progress)}%`);
				}
				// We don't support cancellation for this step yet, or we could add another controller
			);

			// Update store with fetched values
			Object.entries(targetSettings).forEach(([key, value]) => {
				if (currentValues[key] === undefined) {
					if (!deviceState.deviceValues[ms.targetDeviceId])
						deviceState.deviceValues[ms.targetDeviceId] = {};
					(deviceState.deviceValues[ms.targetDeviceId] as Record<string, unknown>)[key] = value;
				}
			});

			deviceState.setMigrationStatus('Comparing...');

			// Ensure we have definitions for the target device to resolve enums/labels
			if (!deviceState.deviceSettings[ms.targetDeviceId]) {
				await checkDeviceStatus(ms.targetDeviceId, token);
			}

			const comparison = Object.keys(ms.parsedBackup.settings)
				.filter((key) => {
					// Filter out readonly and hidden settings
					const def = SETTINGS_DEFINITIONS.find((d) => d.key === key);
					if (!def) return true; // Keep unknown settings (custom params)
					return !def.readonly && !def.hidden;
				})
				.map((key) => {
					const def = SETTINGS_DEFINITIONS.find((d) => d.key === key);
					const label = def ? def.label : key;
					const newVal = ms.parsedBackup!.settings[key];
					// Use the freshly fetched settings
					const currentVal = targetSettings[key];

					// Helper to format value for comparison/display
					const formatValue = (val: any) => {
						// 1. Try to resolve enum label from target device definitions
						const targetDefs = deviceState.deviceSettings[ms.targetDeviceId];
						if (targetDefs) {
							const settingDef = targetDefs.find((s) => s.key === key);
							const options = settingDef?._extra?.options;
							if (options) {
								const option = options.find((o) => String(o.value) === String(val));
								if (option) return option.label;
							}
						}

						// 2. Handle Uint8Array (Bytes) - although decodeParamValue handles this now,
						// we might still have raw values if they came from elsewhere.
						// But wait, decodeParamValue returns strings for non-Bytes.
						// And we updated decodeParamValue to return base64 for Bytes.
						// So we don't need special Bytes handling here if we trust the inputs.

						return val;
					};

					const displayNew = formatValue(newVal);
					const displayCurrent = formatValue(currentVal);

					// Loose equality check for settings (string vs number etc)
					let isDifferent = String(displayNew) !== String(displayCurrent);

					// Special handling for booleans (case insensitive)
					if (
						isDifferent &&
						(String(displayNew).toLowerCase() === 'true' ||
							String(displayNew).toLowerCase() === 'false') &&
						(String(displayCurrent).toLowerCase() === 'true' ||
							String(displayCurrent).toLowerCase() === 'false')
					) {
						isDifferent = String(displayNew).toLowerCase() !== String(displayCurrent).toLowerCase();
					}

					return {
						key,
						label,
						current: displayCurrent,
						new: displayNew,
						isDifferent
					};
				})
				.filter((c) => c.isDifferent);

			deviceState.setMigrationComparison(comparison);
		} catch (e) {
			console.error('Failed to prepare comparison', e);
			// alert('Failed to compare');
		} finally {
			comparing = false;
			deviceState.setMigrationComparing(false);
			deviceState.setMigrationStatus('');
		}
	}

	async function handleTargetSelection() {
		if (!ms.targetDeviceId) return;
		deviceState.setMigrationStep(4);
		await prepareComparison();
	}

	async function applyChanges() {
		if (!ms.parsedBackup || !ms.targetDeviceId) return;

		const targetId = ms.targetDeviceId; // Capture ID before any resets

		// Stage changes for the target device
		ms.comparison.forEach((item: any) => {
			deviceState.stageChange(targetId, item.key, item.new, item.current);
		});

		// Set selected device and wait for persistence
		deviceState.setSelectedDevice(targetId);

		// Small delay to ensure store updates propagate
		await new Promise((r) => setTimeout(r, 50));

		// Navigate to settings page with push modal open
		await goto('/dashboard/settings/device?openPush=true');

		close();

		// Reset state after navigation is initiated
		setTimeout(() => {
			deviceState.resetMigrationState();
		}, 100);
	}
</script>

{#if open}
	<div
		class="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-0"
		role="dialog"
		aria-modal="true"
	>
		<button
			class="absolute inset-0 bg-black/80 backdrop-blur-sm transition-opacity"
			transition:fade={{ duration: 200 }}
			onclick={close}
			aria-label="Close modal"
		></button>

		<div
			class="relative w-full max-w-2xl overflow-hidden rounded-2xl border border-[#334155] bg-[#0f1726] shadow-2xl"
			transition:scale={{ start: 0.95, duration: 200 }}
		>
			<!-- Header -->
			<div class="border-b border-[#334155] bg-[#1e293b]/50 p-6">
				<div class="flex items-center justify-between">
					<h3 class="text-xl font-bold text-white">
						{#if ms.step === 1}
							Migrate Settings
						{:else if ms.type === 'new'}
							New Migration
						{:else}
							Resume Migration
						{/if}
					</h3>
					<div class="flex items-center gap-2">
						{#if ms.isFetching}
							<button
								class="rounded-lg p-2 text-slate-400 hover:bg-white/5 hover:text-white"
								onclick={minimize}
								title="Minimize"
							>
								<Minimize2 size={20} />
							</button>
						{/if}
						<button
							class="rounded-lg p-2 text-slate-400 hover:bg-white/5 hover:text-white"
							onclick={close}
							aria-label="Close"
						>
							<X size={20} />
						</button>
					</div>
				</div>
			</div>

			<div class="p-6">
				{#if ms.step === 1}
					<!-- Intro Step -->
					<div class="space-y-6">
						<div class="flex items-start gap-4 rounded-xl bg-blue-500/10 p-4">
							<Info class="mt-1 shrink-0 text-blue-400" size={24} />
							<div class="space-y-2 text-sm text-blue-200">
								<p>
									<strong class="text-blue-100">How it works:</strong> This wizard helps you transfer
									settings from one device to another.
								</p>
								<p>
									<strong class="text-blue-100">Requirements:</strong> The source device must be
									<strong class="text-white">online</strong> to fetch its configuration.
								</p>
								<p>
									If you don't have the new device yet, you can download a backup file to restore
									later.
								</p>
							</div>
						</div>

						<div class="grid gap-4 sm:grid-cols-2">
							<button
								class="flex flex-col items-center justify-center gap-3 rounded-xl border border-[#334155] bg-[#1e293b]/50 p-6 text-center transition-all hover:border-primary/50 hover:bg-[#1e293b]"
								onclick={() => {
									deviceState.setMigrationType('new');
									deviceState.setMigrationStep(2);
								}}
							>
								<div class="rounded-full bg-primary/20 p-3 text-primary">
									<Play size={24} />
								</div>
								<div>
									<h4 class="font-medium text-white">Start New Migration</h4>
									<p class="mt-1 text-xs text-slate-400">Copy settings from an online device.</p>
								</div>
							</button>

							<button
								class="flex flex-col items-center justify-center gap-3 rounded-xl border border-[#334155] bg-[#1e293b]/50 p-6 text-center transition-all hover:border-primary/50 hover:bg-[#1e293b]"
								onclick={() => {
									deviceState.setMigrationType('resume');
									deviceState.setMigrationStep(2);
								}}
							>
								<div class="rounded-full bg-slate-700 p-3 text-white">
									<RotateCcw size={24} />
								</div>
								<div>
									<h4 class="font-medium text-white">Resume Migration</h4>
									<p class="mt-1 text-xs text-slate-400">Restore settings from a backup file.</p>
								</div>
							</button>
						</div>
					</div>
				{:else if ms.step === 2}
					{#if ms.type === 'new'}
						<!-- Start New: Source Selection -->
						<div class="flex flex-col space-y-4">
							<div class="text-center">
								<h4 class="text-lg font-medium text-white">Select Source Device</h4>
								<div class="mt-1 flex items-center justify-center gap-2">
									<p class="text-slate-400">Choose an online device to copy settings from.</p>
									<button
										class="flex items-center gap-1 rounded px-2 py-0.5 text-xs text-primary hover:bg-primary/10"
										onclick={handleRecheckStatus}
										disabled={isCheckingStatus}
									>
										<RefreshCw size={12} class={isCheckingStatus ? 'animate-spin' : ''} />
										Recheck Status
									</button>
								</div>
							</div>

							{#if sourceDevices.length === 0}
								<div class="rounded-lg bg-slate-800 p-4 text-center text-slate-400">
									No online devices found to copy from.
								</div>
							{:else}
								<div class="grid max-h-60 gap-3 overflow-y-auto">
									{#each sourceDevices as device}
										<button
											class="flex items-center justify-between rounded-lg border border-[#334155] bg-[#1e293b]/50 p-3 text-left transition-colors hover:border-primary hover:bg-[#1e293b]"
											class:border-primary={ms.sourceDeviceId === device.device_id}
											class:bg-[#1e293b]={ms.sourceDeviceId === device.device_id}
											onclick={() => {
												if (!ms.isFetching) {
													deviceState.setMigrationSource(device.device_id || '');
												}
											}}
										>
											<div class="flex items-center gap-3">
												<div class="rounded-full bg-slate-700 p-2">
													<Smartphone size={16} class="text-slate-300" />
												</div>
												<div>
													<div class="font-medium text-white">
														{device.alias || device.device_id}
														{#if device.alias && device.alias !== device.device_id}
															<span class="text-xs font-normal text-slate-400"
																>({device.device_id})</span
															>
														{/if}
													</div>
												</div>
											</div>
											<span class="flex items-center gap-1 text-xs text-emerald-400">
												<Wifi size={12} /> Online
											</span>
										</button>
									{/each}
								</div>

								{#if ms.isFetching}
									<div class="mt-4 space-y-2">
										<div class="flex justify-between text-xs text-slate-400">
											<span>{ms.status}</span>
											<span>{Math.round(ms.progress)}%</span>
										</div>
										<div class="h-2 w-full overflow-hidden rounded-full bg-slate-800">
											<div
												class="h-full bg-primary transition-all duration-300"
												style="width: {ms.progress}%"
											></div>
										</div>
										<div class="flex justify-center pt-2">
											<button
												class="flex items-center gap-2 rounded-lg border border-red-500/20 bg-red-500/10 px-4 py-2 text-sm font-medium text-red-500 transition-colors hover:bg-red-500/20"
												onclick={cancelFetch}
											>
												<Square size={16} class="fill-current" />
												Stop
											</button>
										</div>
									</div>
								{:else}
									<button
										class="btn w-full btn-primary"
										disabled={!ms.sourceDeviceId || ms.isFetching}
										onclick={handleSourceSelection}
									>
										Start Migration <Play size={18} class="ml-2" />
									</button>
								{/if}
							{/if}
						</div>
					{:else}
						<!-- Resume: File Upload -->
						<div class="flex flex-col items-center justify-center space-y-6 py-8">
							<div class="rounded-full bg-primary/10 p-4">
								<Upload size={32} class="text-primary" />
							</div>
							<div class="text-center">
								<h4 class="text-lg font-medium text-white">Upload Settings Backup</h4>
								<p class="mt-1 text-slate-400">
									Select a .json file containing the settings backup.
								</p>
							</div>

							<label class="btn relative btn-primary">
								Choose File
								<input
									type="file"
									accept=".json"
									class="absolute inset-0 h-full w-full cursor-pointer opacity-0"
									onchange={handleFileUpload}
								/>
							</label>

							{#if ms.error}
								<div class="rounded-lg bg-red-500/10 p-3 text-sm text-red-400">
									{ms.error}
								</div>
							{/if}
						</div>
					{/if}

					<div class="flex justify-start pt-4">
						<button
							class="btn text-slate-400 btn-ghost hover:text-white"
							onclick={() => deviceState.setMigrationStep(1)}
						>
							Back
						</button>
					</div>
				{:else if ms.step === 3}
					{#if ms.type === 'new'}
						<!-- Start New: Target/Download -->
						<div class="space-y-6">
							<div class="text-center">
								<h4 class="text-lg font-medium text-white">Settings Fetched</h4>
								<p class="text-slate-400">
									Successfully fetched settings from {devices.find(
										(d: DeviceAuthResponseModel) => d.device_id === ms.sourceDeviceId
									)?.alias || ms.sourceDeviceId}.
								</p>
							</div>

							<div class="rounded-xl border border-[#334155] bg-[#1e293b]/30 p-4">
								<div class="mb-4 flex items-center justify-between">
									<h5 class="font-medium text-white">Select Target Device</h5>
								</div>

								{#if targetDevices.length === 0}
									<div class="rounded-lg bg-slate-800 p-4 text-center text-slate-400">
										No online devices found.
									</div>
								{:else}
									<div class="grid max-h-48 gap-3 overflow-y-auto">
										{#each targetDevices as device}
											<button
												class="flex items-center justify-between rounded-lg border border-[#334155] bg-[#1e293b]/50 p-3 text-left transition-colors hover:border-primary hover:bg-[#1e293b]"
												class:border-primary={ms.targetDeviceId === device.device_id}
												class:bg-[#1e293b]={ms.targetDeviceId === device.device_id}
												onclick={() => deviceState.setMigrationTarget(device.device_id || '')}
											>
												<div class="flex items-center gap-3">
													<div class="rounded-full bg-slate-700 p-2">
														<Smartphone size={16} class="text-slate-300" />
													</div>
													<div>
														<div class="font-medium text-white">
															{device.alias || device.device_id}
															{#if device.alias && device.alias !== device.device_id}
																<span class="text-xs font-normal text-slate-400"
																	>({device.device_id})</span
																>
															{/if}
														</div>
													</div>
												</div>
												<span class="flex items-center gap-1 text-xs text-emerald-400">
													<Wifi size={12} /> Online
												</span>
											</button>
										{/each}
									</div>
								{/if}
							</div>

							<div class="grid gap-3 sm:grid-cols-2">
								<button
									class="btn border border-[#334155] text-slate-400 btn-ghost hover:border-white hover:bg-white/10 hover:text-white"
									onclick={handleDownloadFetchedBackup}
								>
									<Download size={18} class="mr-2" />
									Download & Finish Later
								</button>
								<button
									class="btn btn-primary"
									disabled={!ms.targetDeviceId}
									onclick={handleTargetSelection}
								>
									Next <ArrowRight size={18} class="ml-2" />
								</button>
							</div>
						</div>
					{:else}
						<!-- Resume: Target Selection -->
						<div class="flex flex-col space-y-4">
							<div class="text-center">
								<h4 class="text-lg font-medium text-white">Select Target Device</h4>
								<div class="mt-1 flex items-center justify-center gap-2">
									<p class="text-slate-400">Choose an online device to apply settings to.</p>
									<button
										class="flex items-center gap-1 rounded px-2 py-0.5 text-xs text-primary hover:bg-primary/10"
										onclick={handleRecheckStatus}
									>
										<RefreshCw size={12} />
										Recheck Status
									</button>
								</div>
							</div>

							{#if targetDevices.length === 0}
								<div class="rounded-lg bg-slate-800 p-4 text-center text-slate-400">
									No online devices found.
								</div>
							{:else}
								<div class="grid max-h-60 gap-3 overflow-y-auto">
									{#each targetDevices as device}
										<button
											class="flex items-center justify-between rounded-lg border border-[#334155] bg-[#1e293b]/50 p-3 text-left transition-colors hover:border-primary hover:bg-[#1e293b]"
											class:border-primary={ms.targetDeviceId === device.device_id}
											class:bg-[#1e293b]={ms.targetDeviceId === device.device_id}
											onclick={() => deviceState.setMigrationTarget(device.device_id || '')}
										>
											<div class="flex items-center gap-3">
												<div class="rounded-full bg-slate-700 p-2">
													<Smartphone size={16} class="text-slate-300" />
												</div>
												<div>
													<div class="font-medium text-white">
														{device.alias || device.device_id}
													</div>
													<div class="text-xs text-slate-400">{device.device_id}</div>
												</div>
											</div>
											<span class="flex items-center gap-1 text-xs text-emerald-400">
												<Wifi size={12} /> Online
											</span>
										</button>
									{/each}
								</div>

								<button
									class="btn w-full btn-primary"
									disabled={!ms.targetDeviceId}
									onclick={handleTargetSelection}
								>
									Next <ArrowRight size={18} class="ml-2" />
								</button>
							{/if}
						</div>
					{/if}

					<div class="flex justify-start pt-4">
						<button
							class="btn text-slate-400 btn-ghost hover:text-white"
							onclick={() => deviceState.setMigrationStep(2)}
						>
							Back
						</button>
					</div>
				{:else if ms.step === 4}
					<!-- Comparison Step -->
					<div class="space-y-4">
						<div
							class="flex items-center justify-between gap-4 rounded-xl border border-[#334155] bg-[#1e293b]/30 p-6"
						>
							<!-- Source -->
							<div class="flex flex-1 flex-col items-center overflow-hidden text-center">
								<span class="text-xs font-bold tracking-wider text-slate-500 uppercase">Source</span
								>
								<div
									class="mt-1 w-full truncate font-medium text-white"
									title={devices.find(
										(d: DeviceAuthResponseModel) => d.device_id === ms.parsedBackup?.deviceId
									)?.alias || ms.parsedBackup?.deviceId}
								>
									{devices.find(
										(d: DeviceAuthResponseModel) => d.device_id === ms.parsedBackup?.deviceId
									)?.alias || ms.parsedBackup?.deviceId}
								</div>
								<div
									class="w-full truncate font-mono text-xs text-slate-500"
									title={ms.parsedBackup?.deviceId}
								>
									{ms.parsedBackup?.deviceId}
								</div>
							</div>

							<!-- Arrow -->
							<div class="text-slate-600">
								<ArrowRight size={24} />
							</div>

							<!-- Target -->
							<div class="flex flex-1 flex-col items-center overflow-hidden text-center">
								<span class="text-xs font-bold tracking-wider text-slate-500 uppercase">Target</span
								>
								<div
									class="mt-1 w-full truncate font-medium text-white"
									title={devices.find(
										(d: DeviceAuthResponseModel) => d.device_id === ms.targetDeviceId
									)?.alias || ms.targetDeviceId}
								>
									{devices.find((d: DeviceAuthResponseModel) => d.device_id === ms.targetDeviceId)
										?.alias || ms.targetDeviceId}
								</div>
								<div
									class="w-full truncate font-mono text-xs text-slate-500"
									title={ms.targetDeviceId}
								>
									{ms.targetDeviceId}
								</div>
							</div>
						</div>

						<div class="flex items-center justify-between">
							<h4 class="font-medium text-white">Review Changes</h4>
						</div>

						{#if ms.isComparing}
							<div
								class="flex flex-col items-center justify-center rounded-xl border border-[#334155] bg-[#1e293b]/50 p-8 text-center"
							>
								<Loader2 size={32} class="mb-4 animate-spin text-primary" />
								<h5 class="text-lg font-medium text-white">Comparing Settings...</h5>
								<p class="mt-2 text-slate-400">{ms.status}</p>
							</div>
						{:else if ms.comparison.length === 0}
							<!-- If empty, it might be loading or actually empty. We need a loading state here. -->
							<!-- For now, assuming if we are here, comparison is done or empty. -->
							<!-- But prepareComparison is async. We should have a loading state. -->
							<div class="rounded-xl border border-[#334155] bg-[#1e293b]/50 p-8 text-center">
								<Check size={32} class="mx-auto mb-4 text-emerald-400" />
								<h5 class="text-lg font-medium text-white">No Differences Found</h5>
								<p class="mt-2 text-slate-400">
									The target device already has all the settings from the backup.
								</p>
							</div>
						{:else}
							<div
								class="max-h-[50vh] overflow-y-auto rounded-xl border border-[#334155] bg-[#1e293b]/30"
							>
								<table class="w-full table-fixed text-left text-sm">
									<thead class="bg-[#1e293b] text-xs font-bold text-slate-400 uppercase">
										<tr>
											<th class="w-[40%] p-3">Setting</th>
											<th class="w-[30%] p-3">Current Value</th>
											<th class="w-[30%] p-3">New Value</th>
										</tr>
									</thead>
									<tbody class="divide-y divide-[#334155]">
										{#each ms.comparison as item}
											<tr class="hover:bg-white/5">
												<td class="truncate p-3 font-medium text-white" title={item.label}>
													{item.label}
												</td>
												<td
													class="truncate p-3 text-slate-400"
													title={item.current !== undefined ? String(item.current) : '(default)'}
												>
													{item.current !== undefined ? item.current : '(default)'}
												</td>
												<td class="truncate p-3 font-medium text-primary" title={String(item.new)}>
													{item.new}
												</td>
											</tr>
										{/each}
									</tbody>
								</table>
							</div>

							<div class="rounded-lg bg-blue-500/10 p-4 text-sm text-blue-400">
								<p class="flex items-start gap-2">
									<FileJson size={16} class="mt-0.5 shrink-0" />
									<span>
										Clicking "Apply" will <strong>stage</strong> these {ms.comparison.length} changes.
										You will still need to click "Push to Device" to save them permanently.
									</span>
								</p>
							</div>
						{/if}

						<div class="flex justify-end gap-3 pt-4">
							<button
								class="btn text-slate-400 btn-ghost hover:text-white"
								onclick={() => deviceState.setMigrationStep(3)}
							>
								Back
							</button>
							<button
								class="btn btn-primary"
								disabled={ms.comparison.length === 0}
								onclick={applyChanges}
							>
								Apply Changes
							</button>
						</div>
					</div>
				{/if}
			</div>
		</div>
	</div>
{/if}
