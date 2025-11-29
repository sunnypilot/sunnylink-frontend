<script lang="ts">
	import { goto } from '$app/navigation';
	import { decodeParamValue, encodeParamValue } from '$lib/utils/device';
	import { authState, logtoClient } from '$lib/logto/auth.svelte';
	import { v0Client, v1Client } from '$lib/api/client';
	import { isModelManifest, type ModelBundle } from '$lib/types/models';
	import { deviceState } from '$lib/stores/device.svelte';
	import DashboardSkeleton from '../DashboardSkeleton.svelte';
	import DeviceSelector from '$lib/components/DeviceSelector.svelte';

	let { data } = $props();

	let modelList = $state<ModelBundle[] | undefined>();
	let selectedModelShortName = $state<string | undefined>(undefined);
	let selectedModel = $derived(modelList?.find((m) => m.short_name === selectedModelShortName));
	let loadingModels = $state(false);
	let sendingModel = $state(false);

	let isOffline = $derived(
		deviceState.selectedDeviceId &&
			deviceState.onlineStatuses[deviceState.selectedDeviceId] === 'offline'
	);

	$effect(() => {
		if (!authState.loading && !authState.isAuthenticated) {
			goto('/');
		}
	});

	$effect(() => {
		if (deviceState.selectedDeviceId) {
			fetchModelsForDevice();
		}
	});

	async function fetchModelsForDevice() {
		modelList = undefined;
		selectedModelShortName = undefined;

		if (!logtoClient) return;
		if (!deviceState.selectedDeviceId) return;
		try {
			loadingModels = true;

			const models = await v1Client.GET('/v1/settings/{deviceId}/values', {
				params: {
					path: {
						deviceId: deviceState.selectedDeviceId
					},
					query: {
						paramKeys: ['ModelManager_ModelsCache', 'ModelManager_ActiveBundle']
					}
				},
				headers: {
					Authorization: `Bearer ${await logtoClient.getIdToken()}`
				}
			});

			if (models.data?.items) {
				const modelsCacheParam = models.data.items.find(
					(i) => i.key === 'ModelManager_ModelsCache'
				);
				const activeBundleParam = models.data.items.find(
					(i) => i.key === 'ModelManager_ActiveBundle'
				);

				if (modelsCacheParam) {
					const decodedValue = decodeParamValue(modelsCacheParam);
					if (isModelManifest(decodedValue)) {
						modelList = decodedValue.bundles;
					}
				}

				if (activeBundleParam) {
					let decodedValue = decodeParamValue(activeBundleParam);

					// If it's a string, try to parse it as JSON
					if (typeof decodedValue === 'string') {
						try {
							decodedValue = JSON.parse(decodedValue);
						} catch (e) {
							console.warn('Failed to parse Active Bundle string as JSON:', e);
						}
					}

					// The active bundle is just a ModelBundle object, not a manifest
					// We can check if it has a short_name or internalName
					if (typeof decodedValue === 'object' && decodedValue !== null) {
						// eslint-disable-next-line @typescript-eslint/no-explicit-any
						const bundle = decodedValue as any;
						if ('short_name' in bundle) {
							selectedModelShortName = bundle.short_name;
						} else if ('internalName' in bundle) {
							selectedModelShortName = bundle.internalName;
						} else {
							selectedModelShortName = undefined;
						}
					} else {
						selectedModelShortName = undefined;
					}
				} else {
					selectedModelShortName = undefined;
				}
			}
		} catch (e) {
			console.error('Error fetching models:', e);
		} finally {
			loadingModels = false;
		}
	}

	async function sendModelToDevice() {
		if (!logtoClient) return;
		if (!deviceState.selectedDeviceId) return;
		if (!selectedModel) return;

		try {
			sendingModel = true;
			await v0Client.POST('/settings/{deviceId}', {
				params: {
					path: {
						deviceId: deviceState.selectedDeviceId
					}
				},
				body: [
					{
						key: 'ModelManager_DownloadIndex',
						value: encodeParamValue({
							key: 'ModelManager_DownloadIndex',
							value: String(selectedModel.index ?? ''),
							is_compressed: true
						})
					}
				],
				headers: {
					Authorization: `Bearer ${await logtoClient.getIdToken()}`
				}
			});
		} catch (e) {
			console.error('Error sending model to device:', e);
		} finally {
			sendingModel = false;
		}
	}
</script>

<div class="space-y-6">
	<div class="flex items-center justify-between">
		<div>
			<h1 class="text-2xl font-bold text-white">Models</h1>
			<p class="text-slate-400">Manage and switch driving models for your device.</p>
		</div>

		<!-- Device Selector if needed, though global one exists -->
		<!-- We can rely on the global device selector in the header -->
	</div>

	{#if authState.loading}
		<DashboardSkeleton />
	{:else if !deviceState.selectedDeviceId}
		<div class="flex flex-col items-center justify-center py-12 text-center">
			<div class="mb-4 rounded-full bg-slate-700/50 p-4">
				<svg
					xmlns="http://www.w3.org/2000/svg"
					class="h-12 w-12 text-slate-400"
					fill="none"
					viewBox="0 0 24 24"
					stroke="currentColor"
				>
					<path
						stroke-linecap="round"
						stroke-linejoin="round"
						stroke-width="2"
						d="M9 3v2m6-2v2M9 19v2m6-2v2M5 9H3m2 6H3m18-6h-2m2 6h-2M7 19h10a2 2 0 002-2V7a2 2 0 00-2-2H7a2 2 0 00-2 2v10a2 2 0 002 2zM9 9h6v6H9V9z"
					/>
				</svg>
			</div>
			<h3 class="text-xl font-semibold text-white">No Device Selected</h3>
			<p class="mt-2 text-slate-400">Select a device to view available models.</p>
		</div>
	{:else if isOffline}
		<div class="flex flex-col items-center justify-center py-12 text-center">
			<div class="mb-4 rounded-full bg-red-500/10 p-4">
				<svg
					xmlns="http://www.w3.org/2000/svg"
					class="h-12 w-12 text-red-500"
					fill="none"
					viewBox="0 0 24 24"
					stroke="currentColor"
				>
					<path
						stroke-linecap="round"
						stroke-linejoin="round"
						stroke-width="2"
						d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636"
					/>
				</svg>
			</div>
			<h3 class="text-xl font-semibold text-white">Device Offline</h3>
			<p class="mt-2 max-w-md text-slate-400">
				Your device needs to be online to fetch and manage models.
			</p>
		</div>
	{:else if loadingModels}
		<div class="animate-pulse space-y-6">
			<div class="h-12 w-full rounded bg-slate-700"></div>
			<div class="h-48 w-full rounded bg-slate-700"></div>
		</div>
	{:else}
		<div class="grid gap-6 lg:grid-cols-[1.6fr_1fr]">
			<div class="space-y-6">
				<div class="form-control w-full">
					<div class="label">
						<span
							class="label-text text-sm font-semibold tracking-[0.28em] text-slate-400 uppercase"
							>Available Models</span
						>
					</div>
					<select
						class="select w-full border border-[#334155] bg-[#101a29] text-base text-white focus:border-violet-300"
						bind:value={selectedModelShortName}
						disabled={!modelList}
					>
						<option disabled selected value={undefined}>Select a model</option>
						{#if modelList}
							{#each modelList as model}
								<option value={model.short_name}>{model.display_name}</option>
							{/each}
						{/if}
					</select>
				</div>

				<div class="card-actions">
					<button
						class="btn btn-block border-[#1e293b] bg-[#1e293b] text-sm text-white hover:bg-[#334155] sm:text-base"
						onclick={sendModelToDevice}
						disabled={sendingModel || !selectedModel}>Send to device 🚀</button
					>
					{#if sendingModel}
						<progress class="progress w-full progress-primary"></progress>
					{/if}
				</div>
			</div>

			<div class="card border border-[#1e293b] bg-[#0f1726]">
				<div class="card-body p-6">
					<p class="text-xs font-semibold tracking-[0.32em] text-slate-400 uppercase">
						Selected Model Details
					</p>
					{#if selectedModel}
						<h3 class="card-title text-xl text-white sm:text-2xl">
							{selectedModel.display_name}
						</h3>
						<p class="text-sm text-slate-400">
							{selectedModel.environment} • {selectedModel.build_time
								? new Date(selectedModel.build_time).toLocaleDateString()
								: 'Unknown date'}
						</p>
						<div class="mt-4 flex flex-col gap-2">
							<div class="text-sm">
								<span class="font-bold text-white">Runner:</span>
								<span class="text-slate-400"> {selectedModel.runner ?? 'Unknown'}</span>
							</div>
							<div class="text-sm">
								<span class="font-bold text-white">Generation:</span>
								<span class="text-slate-400">{selectedModel.generation ?? 'Unknown'}</span>
							</div>
						</div>
					{:else}
						<h3 class="card-title text-xl text-white sm:text-2xl">No Model Selected</h3>
						<p class="text-sm text-slate-400">Select a model from the list to view details.</p>
					{/if}
				</div>
			</div>
		</div>
	{/if}
</div>
