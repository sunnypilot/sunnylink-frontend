<script lang="ts">
	import { createDynamicAuthMiddleware } from '$lib/api/auth';
	import { sunnylinkClient, sunnylinkClientV1 } from '$lib/api/client';
	import { toast } from 'svelte-sonner';
	import { type Device } from '$lib/types/types';
	import { type ModelsV7, type ModelBundle } from '$lib/types/models-v7';
	import DeviceSelection from '$lib/components/DeviceSelection.svelte';
	import ModelSelection from '$lib/components/ModelSelection.svelte';
	import DeviceSettings from '$lib/components/DeviceSettings.svelte';
	import { onMount } from 'svelte';
	import { fade } from 'svelte/transition';

	let { data } = $props();

	let allDevices = $state<Device>([]);
	let selectedModel = $state<number>();
	let selectedDevice = $state<string>('');
	let sendingModel = $state<boolean>(false);
	let deploymentAnimation = $state<boolean>(false);
	let deploymentProgress = $state<number>(0);
	let loading = $state(true);
	let models = $state<ModelBundle[]>([]);
	let authReady = $state(false);
	let labelsById = $state<Record<string, string>>({});

	function buildDeviceLabel(detail: any, deviceId: string) {
		const alias = (detail?.alias ?? '').trim();
		const dongle = (detail?.device_id ?? '').trim();
		if (alias && dongle) return `${alias} - ${dongle}`;
		if (alias) return `${alias} - ${deviceId}`;
		return dongle || deviceId;
	}

	onMount(async () => {
		if (data.user) {
			try {
				const modelsResponse = await fetch('https://raw.githubusercontent.com/sunnypilot/sunnypilot-docs/refs/heads/gh-pages/docs/driving_models_v8.json');
				const modelsJson: ModelsV7 = await modelsResponse.json();
				models = modelsJson.bundles.reverse();

				// Attach dynamic auth middleware; use ID token for compatibility
				const authMiddleware = createDynamicAuthMiddleware(() =>
					data.logtoClient ? data.logtoClient.getIdToken() : Promise.resolve(null)
				);
				sunnylinkClient.use(authMiddleware);
				sunnylinkClientV1.use(authMiddleware);
				authReady = true;

				let devicesResp = await sunnylinkClient.GET('/users/{userId}/devices', {
					params: { path: { userId: 'self' } }
				});
				if (!devicesResp.data) {
					// Retry once in case token/key just refreshed; try both access and id tokens
					try {
						await data.logtoClient?.getAccessToken();
						await data.logtoClient?.getIdToken();
					} catch { /* empty */ }
					devicesResp = await sunnylinkClient.GET('/users/{userId}/devices', {
						params: { path: { userId: 'self' } }
					});
				}
				allDevices = devicesResp.data ?? [];
				if (!devicesResp.data && devicesResp.error) {
					toast.warning('Unable to load devices right now. You can still browse models.');
				}
				if (allDevices.length === 1) {
					selectedDevice = allDevices[0].device_id ?? '';
				}

				// Fetch device details to build labels (alias - dongleId)
				try {
					if (allDevices.length === 0) {
						labelsById = {};
						loading = false;
						return;
					}
					const detailResults = await Promise.all(
						allDevices.map((d) =>
							sunnylinkClient.GET('/device/{deviceId}', {
								params: { path: { deviceId: d.device_id ?? '' } }
							})
						)
					);
					const labels: Record<string, string> = {};
					for (let i = 0; i < allDevices.length; i++) {
						const deviceId = allDevices[i].device_id ?? '';
						const detail = detailResults[i]?.data;
						labels[deviceId] = buildDeviceLabel(detail, deviceId);
					}
					labelsById = labels;
				} catch (e) {
					console.warn('Unable to load device details for labels', e);
				}
				loading = false;
			} catch (error: unknown) {
				console.error('Error loading data:', error);
				toast.error('Failed to load dashboard data');
				loading = false;
			}
		}
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
		} catch (error: unknown) {
			clearInterval(progressInterval);
			toast.error('Ah nuts 🔩. We encountered an error');
			console.error('Error:', error);
			sendingModel = false;
			deploymentAnimation = false;
			deploymentProgress = 0;
		}
	}

	const handleDeviceSelect = (deviceId: string) => {
		selectedDevice = deviceId;
	};

	const handleModelSelect = (modelIndex: number) => {
		selectedModel = modelIndex;
	};
</script>

<div class="bg-base-100 relative min-h-screen">
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
					<DeviceSelection
						devices={allDevices}
						{selectedDevice}
						onSelect={handleDeviceSelect}
						{labelsById}
					/>

					<ModelSelection {models} {selectedModel} onSelect={handleModelSelect} />

					<!-- Deploy Button -->
					<div class="pt-4">
						{#if sendingModel}
							<button class="btn btn-primary w-full" disabled>
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
									<span class="font-medium">{labelsById[selectedDevice] || selectedDevice}</span>
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

					{#if authReady}
						<DeviceSettings {selectedDevice} />
					{/if}
				</div>
			</div>
		{/if}
	</div>

	<!-- Page-wide deployment animation overlay -->
	{#if deploymentAnimation}
		<div
			class="bg-base-100/95 fixed inset-0 z-50 flex items-center justify-center backdrop-blur-sm"
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
					<div class="bg-base-300 h-2 w-full rounded-full">
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
