<script lang="ts">
	import { deviceState } from '$lib/stores/device.svelte';
	import { schemaState } from '$lib/stores/schema.svelte';
	import { logtoClient } from '$lib/logto/auth.svelte';
	import { fetchSettingsAsync } from '$lib/api/device';
	import { decodeParamValue } from '$lib/utils/device';
	import VehicleSelector from '$lib/components/vehicle/VehicleSelector.svelte';
	import SchemaItemRenderer from '$lib/components/schema/SchemaItemRenderer.svelte';
	import SettingsActionBar from '$lib/components/SettingsActionBar.svelte';
	import PushSettingsModal from '$lib/components/PushSettingsModal.svelte';
	import { toastState } from '$lib/stores/toast.svelte';
	import { goto } from '$app/navigation';
	import type { SchemaItem } from '$lib/types/schema';

	let deviceId = $derived(deviceState.selectedDeviceId);
	let hasChanges = $derived(deviceId ? deviceState.hasChanges(deviceId) : false);
	let pushModalOpen = $state(false);

	$effect(() => {
		if (!deviceId) {
			goto('/dashboard');
		}
	});

	// Load schema if not already loaded
	$effect(() => {
		if (deviceId && logtoClient && !schemaState.schemas[deviceId] && !schemaState.loading[deviceId]) {
			loadSchema();
		}
	});

	async function loadSchema() {
		if (!deviceId || !logtoClient) return;
		try {
			const token = await logtoClient.getIdToken();
			if (!token) return;
			const gitCommit = deviceState.deviceValues[deviceId]?.['GitCommit'] as string | undefined;
			await schemaState.loadSchema(deviceId, token, gitCommit);
		} catch (e) {
			console.error('Failed to load schema:', e);
		}
	}

	// Determine current brand from capabilities
	let currentBrand = $derived.by(() => {
		if (!deviceId) return '';
		const caps = schemaState.capabilities[deviceId];
		return caps?.brand ?? '';
	});

	// Get brand-specific settings from schema
	let brandSettings: SchemaItem[] = $derived.by(() => {
		if (!deviceId || !currentBrand) return [];
		const schema = schemaState.schemas[deviceId];
		if (!schema?.vehicle_settings) return [];
		return schema.vehicle_settings[currentBrand] ?? [];
	});

	// Fetch brand setting values when brand settings are available
	let loadingBrandValues = $state(false);

	$effect(() => {
		if (deviceId && logtoClient && brandSettings.length > 0) {
			fetchBrandValues();
		}
	});

	async function fetchBrandValues() {
		if (!deviceId || !logtoClient || brandSettings.length === 0) return;

		loadingBrandValues = true;
		try {
			const token = await logtoClient.getIdToken();
			if (!token) return;

			const keys = brandSettings.map((item) => item.key);
			const response = await fetchSettingsAsync(deviceId, keys, token);

			if (response.items) {
				if (!deviceState.deviceValues[deviceId]) {
					deviceState.deviceValues[deviceId] = {};
				}
				for (const item of response.items) {
					if (item.key && item.value !== undefined) {
						deviceState.deviceValues[deviceId][item.key] = decodeParamValue({
							key: item.key,
							value: item.value,
							type: item.type ?? 'String'
						});
					}
				}
			}
		} catch (e) {
			console.error('Failed to fetch brand values:', e);
		} finally {
			loadingBrandValues = false;
		}
	}

	async function handlePushSuccess() {
		fetchBrandValues();
		if (deviceId && logtoClient) {
			const token = await logtoClient.getIdToken();
			if (token) schemaState.refreshCapabilities(deviceId, token);
		}
		toastState.show('Settings pushed successfully!', 'success');
	}
</script>

<div class="mx-auto max-w-7xl px-4 py-6 md:px-0" class:pb-16={hasChanges}>
	<div class="mb-8">
		<h1 class="text-2xl font-bold text-white">Vehicle Settings</h1>
		<p class="mt-2 text-slate-400">Manage your vehicle fingerprint and platform selection.</p>
	</div>

	{#if deviceId}
		<VehicleSelector {deviceId} />

		<!-- Brand-specific settings -->
		{#if brandSettings.length > 0}
			<div class="mt-8">
				<div class="mb-4 flex items-center gap-4">
					<h2
						class="text-sm font-bold tracking-widest whitespace-nowrap text-slate-500 uppercase"
					>
						{currentBrand} Settings
					</h2>
					<div class="h-px w-full bg-slate-800"></div>
				</div>
				<div class="grid grid-cols-1 gap-4 lg:grid-cols-2 xl:grid-cols-3">
					{#each brandSettings as item (item.key)}
						<SchemaItemRenderer {deviceId} {item} loadingValues={loadingBrandValues} />
					{/each}
				</div>
			</div>
		{/if}
	{/if}
</div>

<SettingsActionBar
	onPush={() => (pushModalOpen = true)}
	onReset={() => deviceId && deviceState.clearChanges(deviceId)}
/>

<PushSettingsModal
	bind:open={pushModalOpen}
	onPushSuccess={handlePushSuccess}
/>
