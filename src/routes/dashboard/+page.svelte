<script lang="ts">
	import { goto } from '$app/navigation';
	import { logtoClient, authState } from '$lib/logto/auth.svelte.js';
	import { v0Client, v1Client } from '$lib/api/client.js';
	import { decodeParamValue, encodeParamValue } from '$lib/utils/device';
	import { isModelManifest, type ModelBundle } from '$lib/types/models';

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

	const handleRouteSubmit = (event: SubmitEvent) => {
		event.preventDefault();
	};

	let { data } = $props();
	let selectedDevice = $state<string | undefined>(undefined);

	async function fetchModelsForDevice() {
		if (!logtoClient) return;
		if (!selectedDevice) return;
		try {
			loadingModels = true;

			const models = await v1Client.GET('/v1/settings/{deviceId}/values', {
				params: {
					path: {
						deviceId: selectedDevice
					},
					query: {
						paramKeys: ['ModelManager_ModelsCache']
					}
				},
				headers: {
					Authorization: `Bearer ${await logtoClient.getIdToken()}`
				}
			});
			if (models.data?.items && models.data.items.length > 0) {
				const modelParam = models.data.items[0];
				if (!modelParam) return undefined;

				const decodedValue = decodeParamValue(modelParam);

				if (isModelManifest(decodedValue)) {
					modelList = decodedValue.bundles;
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
		if (!selectedDevice) return;
		if (!selectedModel) return;

		try {
			sendingModel = true;
			await v0Client.POST('/settings/{deviceId}', {
				params: {
					path: {
						deviceId: selectedDevice
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

{#if authState.loading}
	<div class="grid min-h-[60vh] place-content-center text-slate-400">
		<span class="loading loading-lg loading-spinner"></span>
	</div>
{:else}
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
						<p class="text-lg text-slate-300 sm:text-xl">Here's your latest sunnypilot snapshot</p>
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
			<div class="grid gap-6 sm:gap-8 lg:grid-cols-[1.6fr_1fr]">
				<div class="space-y-4 sm:space-y-6">
					<div class="form-control w-full">
						<div class="label">
							<span
								class="label-text text-sm font-semibold tracking-[0.28em] text-slate-400 uppercase"
								>Devices</span
							>
						</div>
						<select
							class="select w-full border border-[#334155] bg-[#101a29] text-base text-white focus:border-violet-300"
							bind:value={selectedDevice}
							onchange={fetchModelsForDevice}
						>
							<option disabled selected value={undefined}>Select a device</option>
							{#each data.devices as device}
								<option value={device.device_id}
									>{device.device_id} - {device.alias ?? 'Not Aliased'}</option
								>
							{/each}
						</select>
					</div>

					<div class="form-control w-full">
						<div class="label">
							<span
								class="label-text text-sm font-semibold tracking-[0.28em] text-slate-400 uppercase"
								>Models</span
							>
						</div>
						{#if loadingModels}
							<progress class="progress w-full progress-primary"></progress>
						{:else}
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
						{/if}
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
							{#if selectedDevice}
								Active Device: <span class="font-semibold">{selectedDevice}</span>
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
		</div>
	</div>

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
