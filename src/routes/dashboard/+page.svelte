<script lang="ts">
	import { createAuthMiddleware } from '$lib/api/auth';
	import { sunnylinkClient } from '$lib/api/client';
	import { toast } from 'svelte-sonner';
	import { type Device } from '$lib/types/types';
	import { type ModelsV7, type ModelBundle } from '$lib/types/models-v7';
	import { onMount, onDestroy } from 'svelte';
	import { fade, fly } from 'svelte/transition';

	let { data } = $props();

	let allDevices = $state<Device>([]);
	let selectedModel = $state<number>();
	let selectedDevice = $state<string>('');
	let sendingModel = $state<Boolean>(false);
	let deploymentAnimation = $state<Boolean>(false);
	let deploymentProgress = $state<number>(0);
	let loading = $state(true);
	let models = $state<ModelBundle[]>([]);

	// Dropdown states
	let deviceDropdownOpen = $state(false);
	let modelDropdownOpen = $state(false);
	let deviceSearch = $state('');
	let modelSearch = $state('');

	// Filtered options
	let filteredDevices = $derived(
		allDevices.filter((device) =>
			(device.device_id ?? '').toLowerCase().includes(deviceSearch.toLowerCase())
		)
	);

	let filteredModels = $derived(
		models.filter((model) => model.display_name.toLowerCase().includes(modelSearch.toLowerCase()))
	);

	onMount(async () => {
		// Add click outside listener
		document.addEventListener('click', handleClickOutside);

		if (data.user) {
			try {
				// Load models
				const modelsResponse = await fetch('https://docs.sunnypilot.ai/driving_models_v7.json');
				const modelsJson: ModelsV7 = await modelsResponse.json();
				models = modelsJson.bundles.reverse();

				// Load devices
				const idToken = await data.logtoClient?.getIdToken();
				const authMiddleware = createAuthMiddleware(idToken ?? '');
				sunnylinkClient.use(authMiddleware);
				const devices = await sunnylinkClient.GET('/users/{userId}/devices', {
					params: { path: { userId: 'self' } }
				});
				allDevices = devices.data!;
				if (allDevices.length === 1) {
					selectedDevice = allDevices[0].device_id ?? '';
				}
				loading = false;
			} catch (error: any) {
				console.error('Error loading data:', error);
				toast.error('Failed to load dashboard data');
				loading = false;
			}
		}
	});

	onDestroy(() => {
		document.removeEventListener('click', handleClickOutside);
	});

	async function sendNewModelToDevice() {
		if (!selectedModel || !selectedDevice) {
			toast.error('Please select both a device and model');
			return;
		}

		sendingModel = true;
		deploymentAnimation = true;
		deploymentProgress = 0;

		const progressInterval = setInterval(() => {
			deploymentProgress = Math.min(deploymentProgress + Math.random() * 15, 95);
		}, 200);

		try {
			const response = await sunnylinkClient.POST('/settings/{deviceId}', {
				params: {
					path: {
						deviceId: selectedDevice ?? ''
					}
				},
				body: [
					{
						key: 'ModelManager_DownloadIndex',
						value: btoa(selectedModel?.toString() ?? ''),
						is_compressed: false
					}
				]
			});

			if (response.error) {
				throw new Error(`HTTP error! Status: ${response.error.detail}`);
			}

			clearInterval(progressInterval);
			deploymentProgress = 100;

			toast.success('Download requested. Check your device for current status. Drive safely! 🚗💨');

			// Keep animation for a bit longer to show success
			setTimeout(() => {
				deploymentAnimation = false;
				deploymentProgress = 0;
			}, 2000);
			sendingModel = false;
			selectedModel = undefined;
		} catch (error: any) {
			clearInterval(progressInterval);
			toast.error('Ah nuts 🔩. We encountered an error');
			console.error('Error:', error);
			sendingModel = false;
			deploymentAnimation = false;
			deploymentProgress = 0;
		}
	}

	function selectDevice(deviceId: string) {
		selectedDevice = deviceId;
		deviceDropdownOpen = false;
		deviceSearch = '';
	}

	function selectModel(modelIndex: number) {
		selectedModel = modelIndex;
		modelDropdownOpen = false;
		modelSearch = '';
	}

	// Close dropdowns when clicking outside
	function handleClickOutside(event: MouseEvent) {
		const target = event.target as Element;
		if (!target.closest('[data-dropdown]')) {
			deviceDropdownOpen = false;
			modelDropdownOpen = false;
		}
	}
</script>

<div class="relative min-h-screen bg-base-100">
	<div class="mx-auto max-w-4xl px-6 py-16">
		{#if !data.user}
			<div class="text-center" in:fade={{ delay: 200, duration: 400 }}>
				<h2 class="mb-3 text-2xl font-medium">Authentication Required</h2>
				<p>Please sign in to access your dashboard.</p>
			</div>
		{:else if loading}
			<div class="flex items-center justify-center py-16" in:fade={{ duration: 300 }}>
				<div class="text-center">
					<div
						class="mb-4 inline-block h-6 w-6 animate-spin rounded-full border-2 border-slate-200 border-t-slate-900"
					></div>
					<p class="text-sm">Loading dashboard...</p>
				</div>
			</div>
		{:else}
			<div class="space-y-8" in:fade={{ delay: 200, duration: 500 }}>
				<!-- Stats Cards -->
				<div class="grid gap-4 sm:grid-cols-3">
					<div class="stats bg-base-300 shadow">
						<div class="stat">
							<div class="stat-title">Connected Devices</div>
							<div class="stat-value text-primary">{allDevices.length}</div>
						</div>
					</div>

					<div class="stats bg-base-300 shadow">
						<div class="stat">
							<div class="stat-title">Available Models</div>
							<div class="stat-value text-secondary">{models.length}</div>
						</div>
					</div>

					<div class="stats bg-base-300 shadow">
						<div class="stat">
							<div class="stat-title">Latest Release</div>
							<div class="stat-value text-accent text-sm">
								{models.length > 0 ? models[0]?.display_name?.split('(')[0].trim() || 'N/A' : 'N/A'}
							</div>
							<div class="stat-desc">
								Gen {models.length > 0 ? models[0]?.generation || '?' : '?'}
							</div>
						</div>
					</div>
				</div>

				<!-- Header -->
				<div class="text-center">
					<h1 class="mb-2 text-2xl font-medium">Deploy Model</h1>
					<p class="text-sm opacity-70">Send models to your openpilot devices</p>
				</div>

				<!-- Form -->
				<div class="mx-auto max-w-2xl space-y-6">
					<!-- Device Selection -->
					<div class="space-y-2">
						<label for="device-select" class="text-sm font-medium">Device</label>
						<div class="relative" data-dropdown>
							<button
								id="device-select"
								onclick={() => (deviceDropdownOpen = !deviceDropdownOpen)}
								class="btn btn-outline w-full justify-between"
							>
								<span>
									{selectedDevice || 'Select a device...'}
								</span>
								<svg
									class="h-4 w-4 transition-transform {deviceDropdownOpen
										? 'rotate-180'
										: ''}"
									fill="none"
									stroke="currentColor"
									viewBox="0 0 24 24"
								>
									<path
										stroke-linecap="round"
										stroke-linejoin="round"
										stroke-width="2"
										d="M19 9l-7 7-7-7"
									/>
								</svg>
							</button>

							{#if deviceDropdownOpen}
								<div
									class="dropdown-content menu absolute z-10 mt-1 w-full rounded-box bg-base-100 shadow-lg"
									transition:fly={{ y: -4, duration: 200 }}
								>
									{#if allDevices.length > 1}
										<div class="border-b p-2">
											<input
												bind:value={deviceSearch}
												placeholder="Search devices..."
												class="input input-bordered input-sm w-full"
											/>
										</div>
									{/if}
									<div class="max-h-48 overflow-auto py-1">
										{#if filteredDevices.length === 0}
											<div class="px-3 py-2 text-sm opacity-60">No devices found</div>
										{:else}
											{#each filteredDevices as device}
												<button
													onclick={() => selectDevice(device.device_id ?? '')}
													class="flex w-full items-center px-3 py-2 text-left text-sm hover:bg-base-200 {selectedDevice ===
													(device.device_id ?? '')
														? 'bg-base-200 font-medium'
														: ''}"
												>
													<div class="flex-1">
														<div class="font-medium">{device.device_id ?? ''}</div>
													</div>
													{#if selectedDevice === (device.device_id ?? '')}
														<svg
															class="h-4 w-4"
															fill="none"
															stroke="currentColor"
															viewBox="0 0 24 24"
														>
															<path
																stroke-linecap="round"
																stroke-linejoin="round"
																stroke-width="2"
																d="M5 13l4 4L19 7"
															/>
														</svg>
													{/if}
												</button>
											{/each}
										{/if}
									</div>
								</div>
							{/if}
						</div>
					</div>

					<!-- Model Selection -->
					<div class="space-y-2">
						<label for="model-select" class="text-sm font-medium">Model</label>
						<div class="relative" data-dropdown>
							<button
								id="model-select"
								onclick={() => (modelDropdownOpen = !modelDropdownOpen)}
								class="btn btn-outline w-full justify-between"
							>
								<span>
									{models.find((m) => m.index === selectedModel)?.display_name ||
										'Select a model...'}
								</span>
								<svg
									class="h-4 w-4 transition-transform {modelDropdownOpen
										? 'rotate-180'
										: ''}"
									fill="none"
									stroke="currentColor"
									viewBox="0 0 24 24"
								>
									<path
										stroke-linecap="round"
										stroke-linejoin="round"
										stroke-width="2"
										d="M19 9l-7 7-7-7"
									/>
								</svg>
							</button>

							{#if modelDropdownOpen}
								<div
									class="dropdown-content menu absolute z-10 mt-1 w-full rounded-box bg-base-100 shadow-lg"
									transition:fly={{ y: -4, duration: 200 }}
								>
									<div class="border-b p-2">
										<input
											bind:value={modelSearch}
											placeholder="Search models..."
											class="input input-bordered input-sm w-full"
										/>
									</div>
									<div class="max-h-64 overflow-auto py-1">
										{#if filteredModels.length === 0}
											<div class="px-3 py-2 text-sm opacity-60">No models found</div>
										{:else}
											{#each filteredModels as model}
												<button
													onclick={() => selectModel(model.index)}
													class="flex w-full items-center px-3 py-2 text-left text-sm hover:bg-base-200 {selectedModel ===
													model.index
														? 'bg-base-200 font-medium'
														: ''}"
												>
													<div class="min-w-0 flex-1">
														<div class="truncate font-medium">{model.display_name}</div>
														<div class="text-xs opacity-60">Generation {model.generation}</div>
													</div>
													{#if selectedModel === model.index}
														<svg
															class="h-4 w-4"
															fill="none"
															stroke="currentColor"
															viewBox="0 0 24 24"
														>
															<path
																stroke-linecap="round"
																stroke-linejoin="round"
																stroke-width="2"
																d="M5 13l4 4L19 7"
															/>
														</svg>
													{/if}
												</button>
											{/each}
										{/if}
									</div>
								</div>
							{/if}
						</div>
					</div>

					<!-- Deploy Button -->
					<div class="pt-4">
						{#if sendingModel}
							<button
								class="btn btn-primary w-full"
								disabled
							>
								<svg
									class="mr-2 h-4 w-4 animate-spin"
									fill="none"
									stroke="currentColor"
									viewBox="0 0 24 24"
								>
									<path
										stroke-linecap="round"
										stroke-linejoin="round"
										stroke-width="2"
										d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
									/>
								</svg>
								Deploying...
							</button>
						{:else}
							<button
								onclick={sendNewModelToDevice}
								disabled={!selectedDevice || selectedModel === undefined || allDevices.length <= 0}
								class="btn btn-primary w-full {!selectedDevice ||
								selectedModel === undefined ||
								allDevices.length <= 0
									? 'btn-disabled'
									: ''}"
							>
								Deploy to Device
							</button>
						{/if}
					</div>

					<!-- Summary -->
					{#if selectedDevice && selectedModel !== undefined}
						<div class="card bg-base-200 p-4" transition:fade={{ duration: 200 }}>
							<div class="space-y-2 text-xs">
								<div class="flex justify-between">
									<span class="opacity-70">Device:</span>
									<span class="font-medium">{selectedDevice}</span>
								</div>
								<div class="flex justify-between">
									<span class="opacity-70">Model:</span>
									<span class="font-medium"
										>{models.find((m) => m.index === selectedModel)?.display_name}</span
									>
								</div>
							</div>
						</div>
					{/if}
				</div>
			</div>
		{/if}
	</div>

	<!-- Page-wide deployment animation overlay -->
	{#if deploymentAnimation}
		<div
			class="fixed inset-0 z-50 flex items-center justify-center bg-base-100/95 backdrop-blur-sm"
			in:fade={{ duration: 300 }}
			out:fade={{ duration: 300 }}
		>
			<div class="text-center">
				<div class="mb-8">
					<div
						class="inline-flex h-20 w-20 items-center justify-center rounded-full bg-gradient-to-br from-blue-500 to-purple-600 shadow-2xl"
					>
						<svg
							class="h-10 w-10 animate-pulse text-white"
							fill="none"
							stroke="currentColor"
							viewBox="0 0 24 24"
						>
							<path
								stroke-linecap="round"
								stroke-linejoin="round"
								stroke-width="2"
								d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M9 19l3 3m0 0l3-3m-3 3V10"
							></path>
						</svg>
					</div>
				</div>
				<h2 class="mb-2 text-2xl font-semibold">Deploying Model</h2>
				<p class="mb-8 opacity-70">Sending your selected model to the device...</p>

				<!-- Animated progress bars -->
				<div class="w-80 space-y-2">
					<div class="mb-1 flex justify-between text-xs opacity-70">
						<span>Progress</span>
						<span>Uploading...</span>
					</div>
					<div class="h-2 w-full rounded-full bg-base-300">
						<div
							class="h-2 rounded-full bg-gradient-to-r from-blue-500 to-purple-600 transition-all duration-300 ease-out"
							style="width: {deploymentProgress}%"
						></div>
					</div>
				</div>
			</div>
		</div>
	{/if}
</div>

<style>
	/* Click outside to close dropdowns */
	:global(body) {
		font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
	}
</style>
