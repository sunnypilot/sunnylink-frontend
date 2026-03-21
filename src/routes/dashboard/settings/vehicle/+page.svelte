<script lang="ts">
	import { deviceState } from '$lib/stores/device.svelte';
	import { schemaState } from '$lib/stores/schema.svelte';
	import { logtoClient } from '$lib/logto/auth.svelte';
	import { fetchSettingsAsync } from '$lib/api/device';
	import { decodeParamValue } from '$lib/utils/device';
	import VehicleSelector from '$lib/components/vehicle/VehicleSelector.svelte';
	import SchemaItemRenderer from '$lib/components/schema/SchemaItemRenderer.svelte';
	import type { SchemaItem } from '$lib/types/schema';

	let deviceId = $derived(deviceState.selectedDeviceId);

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

		const existing = deviceState.deviceValues[deviceId] ?? {};
		const keys = brandSettings.map((item) => item.key);
		const missing = keys.filter((k) => existing[k] === undefined);
		if (missing.length === 0) return;

		loadingBrandValues = true;
		try {
			const token = await logtoClient.getIdToken();
			if (!token) return;

			const response = await fetchSettingsAsync(deviceId, missing, token);

			if (response.items) {
				const vals = deviceState.deviceValues[deviceId] ??= {};
				for (const item of response.items) {
					if (item.key && item.value !== undefined) {
						vals[item.key] = decodeParamValue({
							key: item.key,
							value: item.value,
							type: item.type ?? 'String'
						});
					}
				}
			}

			const vals = deviceState.deviceValues[deviceId] ??= {};
			for (const item of brandSettings) {
				if (vals[item.key] === undefined) {
					if (item.widget === 'toggle') vals[item.key] = false;
					else if (item.widget === 'option' || item.widget === 'multiple_button') vals[item.key] = item.options?.[0]?.value ?? '';
					else vals[item.key] = '';
				}
			}
		} catch (e) {
			console.error('Failed to fetch brand values:', e);
		} finally {
			loadingBrandValues = false;
		}
	}
</script>

<div class="mx-auto max-w-2xl xl:max-w-3xl space-y-6">
	<!-- Page header -->
	<div class="px-4">
		<h2 class="text-[24px] font-medium leading-[32px] tracking-[-0.16px] text-[var(--sl-text-1)]">Vehicle</h2>
		<p class="mt-0.5 text-[0.8125rem] font-[450] text-[var(--sl-text-2)]">Fingerprint and platform selection</p>
	</div>

	{#if deviceId}
		<!-- Vehicle section -->
		<div>
			<p class="mb-2 px-4 text-xs font-semibold tracking-wider text-[var(--sl-text-3)] uppercase">
				Vehicle
			</p>
			<VehicleSelector {deviceId} />
		</div>

		<!-- Brand-specific settings -->
		{#if brandSettings.length > 0}
			<div>
				<p class="mb-2 px-4 text-xs font-semibold tracking-wider text-[var(--sl-text-3)] uppercase">
					{currentBrand} Settings
				</p>
				<div class="overflow-hidden rounded-xl border border-[var(--sl-border)] bg-[var(--sl-bg-surface)]">
					{#each brandSettings as item, i (item.key)}
						<SchemaItemRenderer {deviceId} {item} loadingValues={loadingBrandValues} isLast={i === brandSettings.length - 1} />
					{/each}
				</div>
			</div>
		{/if}
	{/if}
</div>
