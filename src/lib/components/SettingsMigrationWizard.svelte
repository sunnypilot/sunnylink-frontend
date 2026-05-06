<script lang="ts">
	import { fade, fly } from 'svelte/transition';
	import { portal } from '$lib/utils/portal';
	import { cubicOut } from 'svelte/easing';
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
	import { Athenav1Client } from '$lib/api/client';
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
		// Reset to initial screen after exit animation completes
		setTimeout(() => {
			if (!deviceState.migrationState.isOpen && !deviceState.migrationState.isFetching) {
				deviceState.resetMigrationState();
				stepDirection = 'forward';
			}
		}, 300);
	}

	function minimize() {
		deviceState.minimizeMigration();
	}

	function cancelFetch() {
		deviceState.cancelMigration();
	}

	// Locks body + main (the actual scroll container in the DaisyUI drawer layout).
	// Timeout ref prevents race conditions between close→open sequences.
	let savedScrollY = 0;
	let cleanupTimerId: ReturnType<typeof setTimeout> | null = null;

	function lockScroll() {
		if (cleanupTimerId !== null) {
			clearTimeout(cleanupTimerId);
			cleanupTimerId = null;
		}

		savedScrollY = window.scrollY;

		document.body.style.position = 'fixed';
		document.body.style.top = `-${savedScrollY}px`;
		document.body.style.width = '100%';
		document.body.style.overflow = 'hidden';

		const main = document.querySelector('main') as HTMLElement;
		if (main) main.style.overflow = 'hidden';
	}

	function unlockScroll(scrollY: number) {
		document.body.style.position = '';
		document.body.style.top = '';
		document.body.style.width = '';
		document.body.style.overflow = '';

		const main = document.querySelector('main') as HTMLElement;
		if (main) main.style.overflow = '';

		window.scrollTo(0, scrollY);
	}

	$effect(() => {
		if (open) {
			lockScroll();

			const appRoot = document.querySelector('.drawer') as HTMLElement;
			if (appRoot) {
				appRoot.style.transition =
					'transform 0.5s cubic-bezier(0.32, 0.72, 0, 1), border-radius 0.5s cubic-bezier(0.32, 0.72, 0, 1)';
				appRoot.style.transform = 'scale(0.94) translateY(10px)';
				appRoot.style.borderRadius = '12px';
				appRoot.style.overflow = 'hidden';
			}
		}
		return () => {
			const appRoot = document.querySelector('.drawer') as HTMLElement;
			if (appRoot) {
				appRoot.style.transform = '';
				appRoot.style.borderRadius = '';
				appRoot.style.overflow = '';

				const scrollY = savedScrollY;
				cleanupTimerId = setTimeout(() => {
					cleanupTimerId = null;
					appRoot.style.transition = '';
					unlockScroll(scrollY);
				}, 500);
			} else {
				unlockScroll(savedScrollY);
			}
		};
	});

	// Open: emphasized.decelerate — fast start, smooth decel (iOS spring approx)
	function emphasizedDecelerate(t: number): number {
		// cubic-bezier(0.05, 0.7, 0.1, 1) approximation
		return 1 - Math.pow(1 - t, 3);
	}

	// Close: emphasized.accelerate — quick exit
	function emphasizedAccelerate(t: number): number {
		// cubic-bezier(0.3, 0, 0.8, 0.15) approximation
		return t * t * t;
	}

	// Check if mobile for transition direction
	const isMobileWizard = typeof window !== 'undefined' && window.innerWidth < 640;

	// Set direction SYNCHRONOUSLY before step changes so out:fly reads the correct value
	let stepDirection: 'forward' | 'back' = $state('forward');

	function goToStep(step: number) {
		stepDirection = step > ms.step ? 'forward' : 'back';
		deviceState.setMigrationStep(step);
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
			const result = await fetchAllSettings(
				deviceId,
				Athenav1Client,
				token,
				currentValues,
				(progress, status) => {
					deviceState.setBackupProgress(progress, status);
				},
				deviceState.backupState.abortController?.signal,
				deviceState.deviceSettings[deviceId]
			);

			// Update store
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
					`${result.failedKeys.length} settings could not be fetched.`,
					result.failedKeys
				);
			} else {
				downloadSettingsBackup(deviceId, result.settings);
				deviceState.finishBackup(true);
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

	async function handleDownloadFetchedBackup() {
		// This is the "Download Backup" button in Step 3 (Start New flow)
		// We already have the parsed backup in state
		if (!ms.parsedBackup || !ms.sourceDeviceId) return;
		downloadSettingsBackup(
			ms.sourceDeviceId,
			ms.parsedBackup.settings,
			ms.parsedBackup.unavailable_settings
		);
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
				goToStep(3); // Go to Target Selection (Resume flow maps to Step 3 logic effectively or we adjust steps)
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

			const result = await fetchAllSettings(
				ms.targetDeviceId,
				Athenav1Client,
				token,
				currentValues,
				(progress, status) => {
					deviceState.setMigrationStatus(`Fetching target: ${Math.round(progress)}%`);
				},
				undefined,
				deviceState.deviceSettings[ms.targetDeviceId]
			);

			// Update store with fetched values
			Object.entries(result.settings).forEach(([key, value]) => {
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
					const currentVal = result.settings[key];

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
		goToStep(4);
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
		class="fixed inset-0 z-[9999] flex items-end justify-center sm:items-center sm:p-6"
		role="dialog"
		aria-modal="true"
		use:portal
	>
		<button
			class="absolute inset-0 bg-black/40"
			in:fade={{ duration: 400, easing: cubicOut }}
			out:fade={{ duration: 250 }}
			onclick={close}
			aria-label="Close modal"
		></button>

		<div
			class="relative mx-2 mb-2 flex w-[calc(100%-1rem)] flex-col overflow-hidden rounded-xl bg-[var(--sl-bg-surface)] shadow-2xl sm:mx-0 sm:mb-0 sm:min-h-[400px] sm:w-full sm:max-w-2xl sm:border sm:border-[var(--sl-border)]"
			style="max-height: calc(100dvh - 3rem);"
			in:fly={{ y: 800, duration: 500, easing: emphasizedDecelerate }}
			out:fly={{ y: 800, duration: 300, easing: emphasizedAccelerate }}
		>
			<!-- Header -->
			<div
				class="shrink-0 border-b border-[var(--sl-border)] bg-[var(--sl-bg-elevated)]/50 px-4 py-3 sm:px-5 sm:py-4"
			>
				<div class="flex items-center justify-between">
					<h3 class="text-lg font-semibold text-[var(--sl-text-1)]">
						{#if ms.step === 1}
							Device Migration Wizard
						{:else if ms.type === 'new'}
							New Migration
						{:else}
							Resume Migration
						{/if}
					</h3>
					<div class="flex items-center gap-1">
						{#if ms.isFetching}
							<button
								class="flex h-10 w-10 items-center justify-center rounded-lg text-[var(--sl-text-2)] transition-all duration-100 hover:bg-[var(--sl-bg-subtle)] hover:text-[var(--sl-text-1)] active:scale-[0.88] active:bg-[var(--sl-bg-elevated)]"
								onclick={minimize}
								title="Minimize"
							>
								<Minimize2 size={20} />
							</button>
						{/if}
						<button
							class="flex h-10 w-10 items-center justify-center rounded-lg text-[var(--sl-text-2)] transition-all duration-100 hover:bg-[var(--sl-bg-subtle)] hover:text-[var(--sl-text-1)] active:scale-[0.88] active:bg-[var(--sl-bg-elevated)]"
							onclick={close}
							aria-label="Close"
						>
							<X size={20} />
						</button>
					</div>
				</div>
			</div>

			<div class="flex-1 overflow-hidden p-4 sm:p-5" style="display: grid; align-content: start;">
				{#key ms.step}
					<div
						style="grid-area: 1 / 1;"
						in:fly={{ x: stepDirection === 'forward' ? 60 : -60, duration: 200, delay: 120 }}
						out:fly={{ x: stepDirection === 'forward' ? -30 : 30, duration: 120 }}
					>
						{#if ms.step === 1}
							<!-- Intro Step -->
							<div class="space-y-6">
								<div
									class="flex items-start gap-4 rounded-xl border border-primary/20 bg-[var(--sl-accent-muted)] p-4"
								>
									<Info class="mt-1 shrink-0 text-primary" size={24} />
									<div class="space-y-2 text-sm text-[var(--sl-text-2)]">
										<p>
											<strong class="text-[var(--sl-text-1)]">How it works:</strong> This wizard helps
											you transfer settings from one device to another.
										</p>
										<p>
											<strong class="text-[var(--sl-text-1)]">Requirements:</strong> The source
											device must be
											<strong class="font-semibold text-[var(--sl-text-1)]">online</strong> to fetch
											its configuration.
										</p>
										<p>
											If you don't have the new device yet, you can download a backup file to
											restore later.
										</p>
									</div>
								</div>

								<div class="grid gap-4 sm:grid-cols-2">
									<button
										class="flex flex-col items-center justify-center gap-3 rounded-xl border border-[var(--sl-border)] bg-[var(--sl-bg-elevated)]/50 p-4 text-center transition-all duration-150 hover:border-primary/50 hover:bg-[var(--sl-bg-elevated)] active:scale-[0.98] active:opacity-70"
										onclick={() => {
											deviceState.setMigrationType('new');
											goToStep(2);
										}}
									>
										<div class="rounded-full bg-primary/20 p-3 text-primary">
											<Play size={24} />
										</div>
										<div>
											<h4 class="font-medium text-[var(--sl-text-1)]">Start New Migration</h4>
											<p class="mt-1 text-xs text-[var(--sl-text-2)]">
												Copy settings from an online device.
											</p>
										</div>
									</button>

									<button
										class="flex flex-col items-center justify-center gap-3 rounded-xl border border-[var(--sl-border)] bg-[var(--sl-bg-elevated)]/50 p-4 text-center transition-all duration-150 hover:border-primary/50 hover:bg-[var(--sl-bg-elevated)] active:scale-[0.98] active:opacity-70"
										onclick={() => {
											deviceState.setMigrationType('resume');
											goToStep(2);
										}}
									>
										<div
											class="rounded-full bg-[var(--sl-bg-elevated)] p-3 text-[var(--sl-text-1)]"
										>
											<RotateCcw size={24} />
										</div>
										<div>
											<h4 class="font-medium text-[var(--sl-text-1)]">Resume Migration</h4>
											<p class="mt-1 text-xs text-[var(--sl-text-2)]">
												Restore settings from a backup file.
											</p>
										</div>
									</button>
								</div>
							</div>
						{:else if ms.step === 2}
							{#if ms.type === 'new'}
								<!-- Start New: Source Selection -->
								<div class="flex flex-col space-y-4">
									<div class="text-center">
										<h4 class="text-lg font-medium text-[var(--sl-text-1)]">
											Select Source Device
										</h4>
										<div class="mt-1 flex items-center justify-center gap-2">
											<p class="text-[var(--sl-text-2)]">
												Choose an online device to copy settings from.
											</p>
											<button
												class="flex cursor-pointer items-center gap-1 rounded px-2 py-0.5 text-xs text-primary transition-all duration-100 hover:bg-primary/10 active:scale-[0.94] active:bg-primary/20 disabled:cursor-not-allowed disabled:opacity-50"
												onclick={handleRecheckStatus}
												disabled={isCheckingStatus}
											>
												{#if isCheckingStatus}
													<span
														class="loading loading-spinner text-primary"
														style="width: 12px; height: 12px;"
													></span>
												{:else}
													<RefreshCw size={12} />
												{/if}
												Recheck Status
											</button>
										</div>
									</div>

									{#if sourceDevices.length === 0}
										<div
											class="rounded-lg bg-[var(--sl-bg-surface)] p-4 text-center text-[var(--sl-text-2)]"
										>
											No online devices found to copy from.
										</div>
									{:else}
										<div class="grid max-h-60 gap-3 overflow-y-auto">
											{#each sourceDevices as device}
												<button
													class="flex items-center justify-between rounded-lg border border-[var(--sl-border)] bg-[var(--sl-bg-elevated)]/50 p-3 text-left transition-all duration-150 hover:border-primary hover:bg-[var(--sl-bg-elevated)] active:scale-[0.98] active:opacity-70"
													class:border-primary={ms.sourceDeviceId === device.device_id}
													class:bg-[var(--sl-bg-elevated)]={ms.sourceDeviceId === device.device_id}
													onclick={() => {
														if (!ms.isFetching) {
															deviceState.setMigrationSource(device.device_id || '');
														}
													}}
												>
													<div class="flex items-center gap-3">
														<div class="rounded-full bg-[var(--sl-bg-elevated)] p-2">
															<Smartphone size={16} class="text-[var(--sl-text-2)]" />
														</div>
														<div>
															<div class="font-medium text-[var(--sl-text-1)]">
																{device.alias || device.device_id}
																{#if device.alias && device.alias !== device.device_id}
																	<span class="text-xs font-normal text-[var(--sl-text-2)]"
																		>({device.device_id})</span
																	>
																{/if}
															</div>
														</div>
													</div>
													<span
														class="flex items-center gap-1 text-xs text-emerald-600 dark:text-emerald-400 dark:text-emerald-600"
													>
														<Wifi size={12} /> Online
													</span>
												</button>
											{/each}
										</div>

										{#if ms.isFetching}
											<div class="mt-4 space-y-2">
												<div class="flex justify-between text-xs text-[var(--sl-text-2)]">
													<span>{ms.status}</span>
													<span>{Math.round(ms.progress)}%</span>
												</div>
												<div
													class="h-2 w-full overflow-hidden rounded-full bg-[var(--sl-bg-surface)]"
												>
													<div
														class="h-full bg-primary transition-all duration-300"
														style="width: {ms.progress}%"
													></div>
												</div>
												<div class="flex justify-center pt-2">
													<button
														class="flex items-center gap-2 rounded-lg border border-red-500/20 bg-red-500/10 px-4 py-2 text-sm font-medium text-red-500 transition-all duration-100 hover:bg-red-500/20 active:scale-[0.97] active:bg-red-500/30"
														onclick={cancelFetch}
													>
														<Square size={16} class="fill-current" />
														Stop
													</button>
												</div>
											</div>
										{:else}
											<button
												class="btn w-full transition-all duration-100 btn-primary active:scale-[0.98] active:bg-primary/80 disabled:active:scale-100"
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
								<div class="flex flex-col items-center justify-center space-y-5 py-6">
									<div class="rounded-full bg-primary/10 p-4">
										<Upload size={32} class="text-primary" />
									</div>
									<div class="text-center">
										<h4 class="text-lg font-medium text-[var(--sl-text-1)]">
											Upload Settings Backup
										</h4>
										<p class="mt-1 text-[var(--sl-text-2)]">
											Select a .json file containing the settings backup.
										</p>
									</div>

									<label
										class="btn relative transition-all duration-100 btn-primary active:scale-[0.97] active:bg-primary/80"
									>
										Choose File
										<input
											type="file"
											accept=".json"
											class="absolute inset-0 h-full w-full cursor-pointer opacity-0"
											onchange={handleFileUpload}
										/>
									</label>

									{#if ms.error}
										<div
											class="rounded-lg bg-red-500/10 p-3 text-sm text-red-600 dark:text-red-400"
										>
											{ms.error}
										</div>
									{/if}
								</div>
							{/if}

							<div class="flex justify-start pt-4">
								<button
									class="btn text-[var(--sl-text-2)] btn-ghost transition-all duration-100 hover:text-[var(--sl-text-1)] active:scale-[0.97] active:bg-[var(--sl-bg-subtle)]"
									onclick={() => goToStep(1)}
								>
									Back
								</button>
							</div>
						{:else if ms.step === 3}
							{#if ms.type === 'new'}
								<!-- Start New: Target/Download -->
								<div class="space-y-6">
									<div class="text-center">
										<h4 class="text-lg font-medium text-[var(--sl-text-1)]">Settings Fetched</h4>
										{#if ms.error}
											<div
												class="mx-auto mt-2 flex items-start gap-3 rounded-lg bg-yellow-500/10 p-3 text-left text-sm text-yellow-700 dark:text-yellow-200"
											>
												<Info
													class="mt-0.5 shrink-0 text-yellow-600 dark:text-yellow-400"
													size={16}
												/>
												<span>{ms.error}</span>
											</div>
										{:else}
											<p class="text-[var(--sl-text-2)]">
												Successfully fetched settings from {devices.find(
													(d: DeviceAuthResponseModel) => d.device_id === ms.sourceDeviceId
												)?.alias || ms.sourceDeviceId}.
											</p>
										{/if}
									</div>

									<div
										class="rounded-xl border border-[var(--sl-border)] bg-[var(--sl-bg-elevated)]/30 p-4"
									>
										<div class="mb-4 flex items-center justify-between">
											<h5 class="font-medium text-[var(--sl-text-1)]">Select Target Device</h5>
										</div>

										{#if targetDevices.length === 0}
											<div
												class="rounded-lg bg-[var(--sl-bg-surface)] p-4 text-center text-[var(--sl-text-2)]"
											>
												No online devices found.
											</div>
										{:else}
											<div class="grid max-h-48 gap-3 overflow-y-auto">
												{#each targetDevices as device}
													<button
														class="flex items-center justify-between rounded-lg border border-[var(--sl-border)] bg-[var(--sl-bg-elevated)]/50 p-3 text-left transition-all duration-150 hover:border-primary hover:bg-[var(--sl-bg-elevated)] active:scale-[0.98] active:opacity-70"
														class:border-primary={ms.targetDeviceId === device.device_id}
														class:bg-[var(--sl-bg-elevated)]={ms.targetDeviceId ===
															device.device_id}
														onclick={() => deviceState.setMigrationTarget(device.device_id || '')}
													>
														<div class="flex items-center gap-3">
															<div class="rounded-full bg-[var(--sl-bg-elevated)] p-2">
																<Smartphone size={16} class="text-[var(--sl-text-2)]" />
															</div>
															<div>
																<div class="font-medium text-[var(--sl-text-1)]">
																	{device.alias || device.device_id}
																	{#if device.alias && device.alias !== device.device_id}
																		<span class="text-xs font-normal text-[var(--sl-text-2)]"
																			>({device.device_id})</span
																		>
																	{/if}
																</div>
															</div>
														</div>
														<span
															class="flex items-center gap-1 text-xs text-emerald-600 dark:text-emerald-400 dark:text-emerald-600"
														>
															<Wifi size={12} /> Online
														</span>
													</button>
												{/each}
											</div>
										{/if}
									</div>

									<div class="grid gap-3 sm:grid-cols-2">
										<button
											class="btn border border-[var(--sl-border)] text-[var(--sl-text-2)] btn-ghost transition-all duration-100 hover:border-white hover:bg-white/10 hover:text-[var(--sl-text-1)] active:scale-[0.97] active:bg-[var(--sl-bg-subtle)]"
											onclick={handleDownloadFetchedBackup}
										>
											<Download size={18} class="mr-2" />
											Download & Finish Later
										</button>
										<button
											class="btn transition-all duration-100 btn-primary active:scale-[0.97] active:bg-primary/80 disabled:active:scale-100"
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
										<h4 class="text-lg font-medium text-[var(--sl-text-1)]">
											Select Target Device
										</h4>
										<div class="mt-1 flex items-center justify-center gap-2">
											<p class="text-[var(--sl-text-2)]">
												Choose an online device to apply settings to.
											</p>
											<button
												class="flex items-center gap-1 rounded px-2 py-0.5 text-xs text-primary transition-all duration-100 hover:bg-primary/10 active:scale-[0.94] active:bg-primary/20"
												onclick={handleRecheckStatus}
											>
												<RefreshCw size={12} />
												Recheck Status
											</button>
										</div>
									</div>

									{#if targetDevices.length === 0}
										<div
											class="rounded-lg bg-[var(--sl-bg-surface)] p-4 text-center text-[var(--sl-text-2)]"
										>
											No online devices found.
										</div>
									{:else}
										<div class="grid max-h-60 gap-3 overflow-y-auto">
											{#each targetDevices as device}
												<button
													class="flex items-center justify-between rounded-lg border border-[var(--sl-border)] bg-[var(--sl-bg-elevated)]/50 p-3 text-left transition-all duration-150 hover:border-primary hover:bg-[var(--sl-bg-elevated)] active:scale-[0.98] active:opacity-70"
													class:border-primary={ms.targetDeviceId === device.device_id}
													class:bg-[var(--sl-bg-elevated)]={ms.targetDeviceId === device.device_id}
													onclick={() => deviceState.setMigrationTarget(device.device_id || '')}
												>
													<div class="flex items-center gap-3">
														<div class="rounded-full bg-[var(--sl-bg-elevated)] p-2">
															<Smartphone size={16} class="text-[var(--sl-text-2)]" />
														</div>
														<div>
															<div class="font-medium text-[var(--sl-text-1)]">
																{device.alias || device.device_id}
															</div>
															<div class="text-xs text-[var(--sl-text-2)]">{device.device_id}</div>
														</div>
													</div>
													<span
														class="flex items-center gap-1 text-xs text-emerald-600 dark:text-emerald-400 dark:text-emerald-600"
													>
														<Wifi size={12} /> Online
													</span>
												</button>
											{/each}
										</div>

										<button
											class="btn w-full transition-all duration-100 btn-primary active:scale-[0.98] active:bg-primary/80 disabled:active:scale-100"
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
									class="btn text-[var(--sl-text-2)] btn-ghost transition-all duration-100 hover:text-[var(--sl-text-1)] active:scale-[0.97] active:bg-[var(--sl-bg-subtle)]"
									onclick={() => goToStep(2)}
								>
									Back
								</button>
							</div>
						{:else if ms.step === 4}
							<!-- Comparison Step -->
							<div class="space-y-4">
								<div
									class="flex items-center justify-between gap-4 rounded-xl border border-[var(--sl-border)] bg-[var(--sl-bg-elevated)]/30 p-4"
								>
									<!-- Source -->
									<div class="flex flex-1 flex-col items-center overflow-hidden text-center">
										<span class="text-xs font-bold tracking-wider text-[var(--sl-text-3)] uppercase"
											>Source</span
										>
										<div
											class="mt-1 w-full truncate font-medium text-[var(--sl-text-1)]"
											title={devices.find(
												(d: DeviceAuthResponseModel) => d.device_id === ms.parsedBackup?.deviceId
											)?.alias || ms.parsedBackup?.deviceId}
										>
											{devices.find(
												(d: DeviceAuthResponseModel) => d.device_id === ms.parsedBackup?.deviceId
											)?.alias || ms.parsedBackup?.deviceId}
										</div>
										<div
											class="w-full truncate font-mono text-xs text-[var(--sl-text-3)]"
											title={ms.parsedBackup?.deviceId}
										>
											{ms.parsedBackup?.deviceId}
										</div>
									</div>

									<!-- Arrow -->
									<div class="text-[var(--sl-text-3)]">
										<ArrowRight size={24} />
									</div>

									<!-- Target -->
									<div class="flex flex-1 flex-col items-center overflow-hidden text-center">
										<span class="text-xs font-bold tracking-wider text-[var(--sl-text-3)] uppercase"
											>Target</span
										>
										<div
											class="mt-1 w-full truncate font-medium text-[var(--sl-text-1)]"
											title={devices.find(
												(d: DeviceAuthResponseModel) => d.device_id === ms.targetDeviceId
											)?.alias || ms.targetDeviceId}
										>
											{devices.find(
												(d: DeviceAuthResponseModel) => d.device_id === ms.targetDeviceId
											)?.alias || ms.targetDeviceId}
										</div>
										<div
											class="w-full truncate font-mono text-xs text-[var(--sl-text-3)]"
											title={ms.targetDeviceId}
										>
											{ms.targetDeviceId}
										</div>
									</div>
								</div>

								<div class="flex items-center justify-between">
									<h4 class="font-medium text-[var(--sl-text-1)]">Review Changes</h4>
								</div>

								{#if ms.isComparing}
									<div
										class="flex flex-col items-center justify-center rounded-xl border border-[var(--sl-border)] bg-[var(--sl-bg-elevated)]/50 p-6 text-center"
									>
										<Loader2 size={32} class="mb-4 animate-spin text-primary" />
										<h5 class="text-lg font-medium text-[var(--sl-text-1)]">
											Comparing Settings...
										</h5>
										<p class="mt-2 text-[var(--sl-text-2)]">{ms.status}</p>
									</div>
								{:else if ms.comparison.length === 0}
									<!-- If empty, it might be loading or actually empty. We need a loading state here. -->
									<!-- For now, assuming if we are here, comparison is done or empty. -->
									<!-- But prepareComparison is async. We should have a loading state. -->
									<div
										class="rounded-xl border border-[var(--sl-border)] bg-[var(--sl-bg-elevated)]/50 p-6 text-center"
									>
										<Check size={32} class="mx-auto mb-4 text-emerald-600 dark:text-emerald-400" />
										<h5 class="text-lg font-medium text-[var(--sl-text-1)]">
											No Differences Found
										</h5>
										<p class="mt-2 text-[var(--sl-text-2)]">
											The target device already has all the settings from the backup.
										</p>
									</div>
								{:else}
									<div
										class="max-h-[50vh] overflow-y-auto rounded-xl border border-[var(--sl-border)] bg-[var(--sl-bg-elevated)]/30"
									>
										<!-- Desktop: table layout -->
										<table class="hidden w-full table-fixed text-left text-sm sm:table">
											<thead
												class="bg-[var(--sl-bg-elevated)] text-xs font-bold text-[var(--sl-text-2)] uppercase"
											>
												<tr>
													<th class="w-[40%] p-3">Setting</th>
													<th class="w-[30%] p-3">Current Value</th>
													<th class="w-[30%] p-3">New Value</th>
												</tr>
											</thead>
											<tbody class="divide-y divide-[var(--sl-border)]">
												{#each ms.comparison as item}
													<tr class="hover:bg-white/5">
														<td
															class="truncate p-3 font-medium text-[var(--sl-text-1)]"
															title={item.label}
														>
															{item.label}
														</td>
														<td
															class="truncate p-3 text-[var(--sl-text-2)]"
															title={item.current !== undefined
																? String(item.current)
																: '(default)'}
														>
															{item.current !== undefined ? item.current : '(default)'}
														</td>
														<td
															class="truncate p-3 font-medium text-primary"
															title={String(item.new)}
														>
															{item.new}
														</td>
													</tr>
												{/each}
											</tbody>
										</table>
										<!-- Mobile: stacked card layout -->
										<div class="divide-y divide-[var(--sl-border)] sm:hidden">
											{#each ms.comparison as item}
												<div class="px-3 py-3">
													<div class="text-sm font-medium text-[var(--sl-text-1)]">
														{item.label}
													</div>
													<div class="mt-1.5 flex items-center gap-2 text-sm">
														<span class="text-[var(--sl-text-3)]"
															>{item.current !== undefined ? item.current : '(default)'}</span
														>
														<ArrowRight size={12} class="shrink-0 text-[var(--sl-text-3)]" />
														<span class="font-medium text-primary">{item.new}</span>
													</div>
												</div>
											{/each}
										</div>
									</div>

									<div
										class="rounded-lg bg-blue-50 p-4 text-sm text-blue-700 dark:bg-blue-500/10 dark:text-blue-400"
									>
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
										class="btn text-[var(--sl-text-2)] btn-ghost hover:text-[var(--sl-text-1)]"
										onclick={() => goToStep(3)}
									>
										Back
									</button>
									<button
										class="btn transition-all duration-100 btn-primary active:scale-[0.97] active:bg-primary/80 disabled:active:scale-100"
										disabled={ms.comparison.length === 0}
										onclick={applyChanges}
									>
										Apply Changes
									</button>
								</div>
							</div>
						{/if}
					</div>
				{/key}
			</div>
		</div>
	</div>
{/if}
