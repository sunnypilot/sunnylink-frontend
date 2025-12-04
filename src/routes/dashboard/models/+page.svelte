<script lang="ts">
	import { untrack } from 'svelte';
	import { goto } from '$app/navigation';
	import { decodeParamValue, encodeParamValue } from '$lib/utils/device';
	import { authState, logtoClient } from '$lib/logto/auth.svelte';
	import { v0Client, v1Client } from '$lib/api/client';
	import { checkDeviceStatus } from '$lib/api/device';
	import { isModelManifest, type ModelBundle } from '$lib/types/models';
	import { deviceState } from '$lib/stores/device.svelte';
	import DashboardSkeleton from '../DashboardSkeleton.svelte';
	import DeviceSelector from '$lib/components/DeviceSelector.svelte';
	import ForceOffroadModal from '$lib/components/ForceOffroadModal.svelte';
	import { AlertTriangle, ShieldAlert } from 'lucide-svelte';

	let { data } = $props();

	let modelList = $state<ModelBundle[] | undefined>();
	let selectedModelShortName = $state<string | undefined>(undefined);
	let selectedModel = $derived(modelList?.find((m) => m.short_name === selectedModelShortName));
	let loadingModels = $state(false);
	let sendingModel = $state(false);
	let isOffroad = $derived(
		deviceState.selectedDeviceId
			? (deviceState.offroadStatuses[deviceState.selectedDeviceId]?.isOffroad ?? false)
			: false
	);
	let forceOffroadModalOpen = $state(false);

	let isOffline = $derived(
		deviceState.selectedDeviceId &&
			deviceState.onlineStatuses[deviceState.selectedDeviceId] === 'offline'
	);

	let isCheckingStatus = $derived(
		deviceState.selectedDeviceId &&
			(deviceState.onlineStatuses[deviceState.selectedDeviceId] === 'loading' ||
				deviceState.onlineStatuses[deviceState.selectedDeviceId] === undefined)
	);

	// Check status on mount / device change if not already online
	$effect(() => {
		const deviceId = deviceState.selectedDeviceId;
		if (deviceId && authState.isAuthenticated) {
			untrack(() => {
				const status = deviceState.onlineStatuses[deviceId];
				if (status === undefined || status === 'offline') {
					logtoClient?.getIdToken().then((token) => {
						if (token && deviceState.selectedDeviceId === deviceId) {
							checkDeviceStatus(deviceId, token);
						}
					});
				}
			});
		}
	});

	// Auto-refresh when device comes online
	$effect(() => {
		if (
			deviceState.selectedDeviceId &&
			deviceState.onlineStatuses[deviceState.selectedDeviceId] === 'online'
		) {
			fetchModelsForDevice();
		}
	});

	async function fetchModelsForDevice() {
		modelList = undefined;
		selectedModelShortName = undefined;
		// isOffroad is derived, no need to reset local state

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
						paramKeys: [
							'ModelManager_ModelsCache',
							'ModelManager_ActiveBundle',
							'IsOffroad',
							'OffroadMode'
						]
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
				const isOffroadParam = models.data.items.find((i) => i.key === 'IsOffroad');
				const offroadModeParam = models.data.items.find((i) => i.key === 'OffroadMode');

				let isOffroadVal = false;
				if (isOffroadParam) {
					const val = decodeParamValue(isOffroadParam);
					// IsOffroad is usually "1" or "0" or boolean
					isOffroadVal = val === '1' || val === 1 || val === true || val === 'true';
				}

				let forceOffroad = false;
				if (offroadModeParam) {
					const val = decodeParamValue(offroadModeParam);
					forceOffroad = val === '1' || val === 1 || val === true || val === 'true';
				}

				// Update global state
				if (deviceState.selectedDeviceId) {
					deviceState.offroadStatuses[deviceState.selectedDeviceId] = {
						isOffroad: isOffroadVal,
						forceOffroad
					};
				}

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

	async function recheckStatus() {
		if (!deviceState.selectedDeviceId || !logtoClient) return;
		const token = await logtoClient.getIdToken();
		if (token) {
			await checkDeviceStatus(deviceState.selectedDeviceId, token);
			await fetchModelsForDevice();
		}
	}

	async function sendModelToDevice() {
		if (!logtoClient) return;
		if (!deviceState.selectedDeviceId) return;
		if (!selectedModel) return;

		try {
			sendingModel = true;

			// Pre-push check: Verify IsOffroad is still true
			const token = await logtoClient.getIdToken();
			if (!token) throw new Error('Not authenticated');
			const statusRes = await v1Client.GET('/v1/settings/{deviceId}/values', {
				params: {
					path: { deviceId: deviceState.selectedDeviceId },
					query: { paramKeys: ['IsOffroad'] }
				},
				headers: { Authorization: `Bearer ${token}` }
			});

			const isOffroadParam = statusRes.data?.items?.find((i) => i.key === 'IsOffroad');
			let currentIsOffroad = false;
			if (isOffroadParam) {
				const val = decodeParamValue(isOffroadParam);
				currentIsOffroad = val === '1' || val === 1 || val === true || val === 'true';
			}

			if (!currentIsOffroad) {
				// Update global state to reflect reality
				if (deviceState.selectedDeviceId) {
					deviceState.offroadStatuses[deviceState.selectedDeviceId] = {
						isOffroad: false,
						forceOffroad:
							deviceState.offroadStatuses[deviceState.selectedDeviceId]?.forceOffroad ?? false
					};
				}
				throw new Error('Device is Onroad. Cannot push model.');
			}

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
							type: 'String'
						}),
						is_compressed: false
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
		{#await data.streamed.devices then devices}
			{@const selectedDevice = devices?.find(
				(d: { device_id: string | null }) => d.device_id === deviceState.selectedDeviceId
			)}
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
				<h3 class="text-xl font-semibold text-white">
					Device Offline: {selectedDevice?.alias ?? selectedDevice?.device_id ?? 'Unknown'}
					{#if selectedDevice?.alias}
						<span class="block text-sm font-normal text-slate-400"
							>({selectedDevice?.device_id})</span
						>
					{/if}
				</h3>
				<p class="mt-2 max-w-md text-slate-400">
					Your device needs to be online to fetch and manage models.
				</p>
				<div class="mt-6">
					<button
						class="btn btn-sm btn-primary"
						onclick={async () => {
							if (deviceState.selectedDeviceId && logtoClient) {
								const token = await logtoClient.getIdToken();
								if (token) {
									await checkDeviceStatus(deviceState.selectedDeviceId, token);
								}
							}
						}}
					>
						Retry Connection
					</button>
					<div class="divider text-xs tracking-widest text-slate-600">OR SELECT ANOTHER DEVICE</div>
					{#if devices}
						<DeviceSelector {devices} />
					{/if}
				</div>
			</div>
		{/await}
	{:else if loadingModels || isCheckingStatus}
		<div class="animate-pulse space-y-6">
			{#if isCheckingStatus}
				<div class="flex items-center gap-2 text-slate-400">
					<span class="loading loading-sm loading-spinner"></span>
					<span>Checking device status...</span>
				</div>
			{/if}
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

				{#if !isOffroad}
					<div class="rounded-lg border border-amber-500/30 bg-amber-500/10 p-4">
						<div class="flex items-start gap-3">
							<ShieldAlert class="mt-0.5 shrink-0 text-amber-500" size={20} />
							<div class="space-y-2">
								<p class="text-sm font-medium text-amber-200">Device is Onroad</p>
								<p class="text-xs text-amber-200/80">
									Models cannot be changed while the device is driving. Park the vehicle to change
									models.
								</p>
								<div class="flex flex-wrap gap-3">
									<button
										class="text-xs font-semibold text-amber-500 underline decoration-amber-500/50 underline-offset-2 hover:text-amber-400"
										onclick={() => (forceOffroadModalOpen = true)}
									>
										Force Offroad Mode (Danger)
									</button>
									<button
										class="text-xs font-semibold text-slate-400 underline decoration-slate-500/50 underline-offset-2 hover:text-slate-300"
										onclick={recheckStatus}
									>
										Recheck Status
									</button>
								</div>
							</div>
						</div>
					</div>
				{/if}

				<div class="card-actions">
					<button
						class="btn btn-block border-[#1e293b] bg-[#1e293b] text-sm text-white hover:bg-[#334155] sm:text-base"
						onclick={sendModelToDevice}
						disabled={sendingModel || !selectedModel || !isOffroad}>Send to device 🚀</button
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

<ForceOffroadModal
	bind:open={forceOffroadModalOpen}
	onSuccess={async () => {
		// Refresh status
		await recheckStatus();
	}}
/>
