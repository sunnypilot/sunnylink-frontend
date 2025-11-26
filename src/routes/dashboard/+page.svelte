<script lang="ts">
	import { goto } from '$app/navigation';
	import { decodeParamValue, encodeParamValue } from '$lib/utils/device';
	import { authState, logtoClient } from '$lib/logto/auth.svelte';
	import { v0Client, v1Client } from '$lib/api/client';
	import { isModelManifest, type ModelBundle } from '$lib/types/models';
	import { deviceState } from '$lib/stores/device.svelte';
	import { checkDeviceStatus } from '$lib/api/device';
	import DeviceSelector from '$lib/components/DeviceSelector.svelte';
	import DashboardSkeleton from './DashboardSkeleton.svelte';

	let modelList = $state<ModelBundle[] | undefined>();
	let selectedModelShortName = $state<string | undefined>(undefined);
	let selectedModel = $derived(modelList?.find((m) => m.short_name === selectedModelShortName));
	let loadingModels = $state(false);
	let sendingModel = $state(false);

	$effect(() => {
		if (!authState.loading && !authState.isAuthenticated) {
			goto('/');
		}
	});

	$effect(() => {
		if (deviceState.selectedDeviceId) {
			fetchModelsForDevice();
			// Settings are fetched by the layout/global selector now
		}
	});

	const handleRouteSubmit = (event: SubmitEvent) => {
		event.preventDefault();
	};

	let { data } = $props();
	// selectedDevice is now managed by deviceState.selectedDeviceId
	// onlineStatuses are now managed by deviceState.onlineStatuses

	let isOffline = $derived(
		deviceState.selectedDeviceId &&
			deviceState.onlineStatuses[deviceState.selectedDeviceId] === 'offline'
	);

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

```
{#if authState.loading}
	<DashboardSkeleton />
{:else}
	{#await data.streamed.devices}
		<DashboardSkeleton />
	{:then devices}
		<div class="space-y-4 sm:space-y-6 lg:space-y-8">
			<div class="card border border-[#1e293b] bg-[#0f1726]">
				<div class="card-body p-4 sm:p-6 lg:p-8">
					<div
						class="flex flex-col gap-4 sm:gap-6 lg:flex-row lg:items-start lg:justify-between lg:gap-8"
					>
						<div class="max-w-2xl space-y-3 sm:space-y-4">
							<p class="text-xs tracking-[0.3em] text-slate-400 uppercase">Daily sunnypilot</p>
							<h1 class="text-2xl font-bold text-white sm:text-3xl md:text-4xl lg:text-5xl">
								Hi {authState.profile?.name || 'there'}!
							</h1>
							<p class="text-lg text-slate-300 sm:text-xl">
								Here's your latest sunnypilot snapshot
							</p>
							<p class="text-sm text-slate-400 sm:text-base">
								Dive in to see new routes, backups, and model insights. Everything you need, all in
								one place.
							</p>
						</div>
					</div>
				</div>
			</div>
		</div>

		<div class="card mt-2 border border-[#1e293b] bg-[#0f1726]">
			<div class="card-body p-4 sm:p-6 lg:p-8">
				{#if loadingModels}
					<div class="animate-pulse">
						<div class="grid gap-6 sm:gap-8 lg:grid-cols-[1.6fr_1fr]">
							<div class="space-y-4 sm:space-y-6">
								<div class="form-control w-full">
									<div class="mb-2 h-4 w-24 rounded bg-slate-700"></div>
									<div class="h-12 w-full rounded bg-slate-700"></div>
								</div>
								<div class="form-control w-full">
									<div class="mb-2 h-4 w-24 rounded bg-slate-700"></div>
									<div class="h-12 w-full rounded bg-slate-700"></div>
								</div>
							</div>
							<div class="card border border-[#1e293b] bg-[#0f1726]">
								<div class="card-body space-y-4 p-4 sm:p-6">
									<div class="h-4 w-32 rounded bg-slate-700"></div>
									<div class="h-8 w-48 rounded bg-slate-700"></div>
									<div class="h-4 w-40 rounded bg-slate-700"></div>
									<div class="mt-4 space-y-2">
										<div class="h-4 w-full rounded bg-slate-700"></div>
										<div class="h-4 w-full rounded bg-slate-700"></div>
									</div>
								</div>
							</div>
						</div>
						<div class="mt-6 sm:mt-8">
							<div class="h-12 w-full rounded bg-slate-700"></div>
						</div>
					</div>
				{:else if isOffline}
					{#await data.streamed.devices then devices}
						{@const selectedDevice = devices?.find(
							(d) => d.device_id === deviceState.selectedDeviceId
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
								This device appears to be offline. Please check its connectivity and try again.
							</p>
							<div class="mt-6 flex flex-col items-center gap-4">
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
								<div class="divider text-slate-600">OR</div>
								<p class="text-sm text-slate-400">Select another device:</p>
								{#if devices}
									<DeviceSelector {devices} />
								{/if}
							</div>
						</div>
					{/await}
				{:else if !selectedModel}
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
						<h3 class="card-title text-xl text-white sm:text-2xl lg:text-3xl">
							No Device Selected
						</h3>
						<p class="mt-2 text-sm text-slate-400">Select a device to view details</p>
						<div class="mt-6">
							{#await data.streamed.devices then devices}
								{#if devices}
									<DeviceSelector {devices} />
								{/if}
							{/await}
						</div>
					</div>
				{:else}
					<div class="grid gap-6 sm:gap-8 lg:grid-cols-[1.6fr_1fr]">
						<div class="space-y-4 sm:space-y-6">
							<div class="form-control w-full">
								<!-- Device selection moved to global layout -->
							</div>

							<div class="form-control w-full">
								<div class="label">
									<span
										class="label-text text-sm font-semibold tracking-[0.28em] text-slate-400 uppercase"
										>Models</span
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
						</div>

						<div class="card border border-[#1e293b] bg-[#0f1726]">
							<div class="card-body p-4 sm:p-6">
								<p class="text-xs font-semibold tracking-[0.32em] text-slate-400 uppercase">
									Current Model
								</p>
								{#if selectedModel}
									<h3 class="card-title text-xl text-white sm:text-2xl lg:text-3xl">
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
									<h3 class="card-title text-xl text-white sm:text-2xl lg:text-3xl">
										No Model Selected
									</h3>
									<p class="text-sm text-slate-400">Select a device and model to view details</p>
								{/if}

								<div class="mt-4 card-actions text-white">
									{#if deviceState.selectedDeviceId}
										Active Device: <span class="font-semibold">{deviceState.selectedDeviceId}</span>
									{/if}
								</div>
							</div>
						</div>
					</div>

					<div class="mt-6 card-actions sm:mt-8">
						<button
							class="btn btn-block border-[#1e293b] bg-[#1e293b] text-sm text-white hover:bg-[#334155] sm:text-base"
							onclick={sendModelToDevice}
							disabled={sendingModel}>Send to device 🚀</button
						>
						{#if sendingModel}
							<progress class="progress w-full progress-primary"></progress>
						{/if}
					</div>
				{/if}
			</div>
		</div>

		<!-- TODO: Navigation and Routes are hidden for now, pending refinement -->
		{#if false}
			<div class="card mt-2 gap-2 border border-[#1e293b] bg-[#0f1726]">
				<div class="card-body p-4 sm:p-6 lg:p-8">
					<div
						class="mb-4 flex flex-col gap-3 sm:mb-6 sm:gap-4 lg:flex-row lg:items-center lg:justify-between"
					>
						<div>
							<p class="text-xs tracking-[0.35em] text-slate-400 uppercase">Navigation</p>
							<h3 class="text-xl font-semibold text-white sm:text-2xl">Plan a destination</h3>
						</div>
						<button
							class="btn w-full border border-[#1e293b] text-slate-300 btn-ghost btn-sm hover:bg-[#1e293b] hover:text-white sm:w-auto"
							>View recent places</button
						>
					</div>

					<div class="grid gap-6 sm:gap-8 lg:grid-cols-[1.05fr_1fr]">
						<form class="space-y-4 sm:space-y-5" onsubmit={handleRouteSubmit}>
							<div class="form-control w-full">
								<label class="label" for="start-point">
									<span class="label-text text-sm font-medium text-slate-300">Start point</span>
								</label>
								<input
									id="start-point"
									type="text"
									placeholder="Current location"
									class="input w-full border border-[#334155] bg-[#101a29] text-white placeholder:text-slate-500"
								/>
							</div>

							<div class="form-control w-full">
								<label class="label" for="destination">
									<span class="label-text text-sm font-medium text-slate-300">Destination</span>
								</label>
								<div class="join w-full flex-col sm:flex-row">
									<input
										id="destination"
										type="text"
										placeholder="Search city, address, or coordinates"
										class="input join-item w-full border border-[#334155] bg-[#101a29] text-sm text-white placeholder:text-slate-500 sm:text-base"
									/>
									<button
										class="btn join-item w-full border border-[#1e293b] bg-[#1e293b] text-sm text-white hover:bg-[#334155] sm:w-auto sm:text-base"
										>Plan route</button
									>
								</div>
							</div>

							<button
								type="submit"
								class="btn btn-block border-[#1e293b] bg-[#1e293b] text-sm text-white hover:bg-[#334155] sm:text-base"
								>Send to device</button
							>
						</form>

						<div class="card border border-dashed border-[#334155] bg-[#0f1726]">
							<div
								class="card-body min-h-[200px] items-center justify-center p-4 text-center sm:min-h-[300px] sm:p-6"
							>
								<span class="text-xs tracking-[0.35em] text-slate-500 uppercase sm:text-sm"
									>MAP GOES HERE</span
								>
							</div>
						</div>
					</div>
				</div>
			</div>
		{/if}
	{:catch error}
		<div class="alert alert-error">
			Failed to load: {error.message}
		</div>
	{/await}
{/if}
