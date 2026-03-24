<script lang="ts">
	import { deviceState } from '$lib/stores/device.svelte';
	import { schemaState } from '$lib/stores/schema.svelte';
	import { logtoClient } from '$lib/logto/auth.svelte';
	import { fetchSettingsAsync } from '$lib/api/device';
	import { decodeParamValue } from '$lib/utils/device';
	import { createSyncStatus } from '$lib/utils/syncStatus.svelte';
	import { batchPush } from '$lib/stores/batchPush.svelte';
	import VehicleSelector from '$lib/components/vehicle/VehicleSelector.svelte';
	import SchemaItemRenderer from '$lib/components/schema/SchemaItemRenderer.svelte';
	import SyncStatusIndicator from '$lib/components/SyncStatusIndicator.svelte';
	import type { SchemaItem } from '$lib/types/schema';

	let deviceId = $derived(deviceState.selectedDeviceId);
	let isDeviceOffline = $derived(deviceId ? (deviceState.onlineStatuses[deviceId] === 'offline' || deviceState.onlineStatuses[deviceId] === 'error') : false);

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
	let brandData = $derived.by(() => {
		if (!deviceId || !currentBrand) return null;
		const schema = schemaState.schemas[deviceId];
		if (!schema?.vehicle_settings) return null;
		return schema.vehicle_settings[currentBrand] ?? null;
	});

	let brandSettings: SchemaItem[] = $derived(brandData?.items ?? []);

	// Fetch brand setting values when brand settings are available
	let loadingBrandValues = $state(false);
	let brandValuesFetchFailed = $state(false);

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
		brandValuesFetchFailed = false;
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
			brandValuesFetchFailed = true;
		} finally {
			loadingBrandValues = false;
		}
	}

	let schemaRevalStatus = $derived(
		deviceId ? schemaState.revalidationStatus[deviceId] ?? null : null
	);

	// Vehicle API in-flight tracking (select/remove operations)
	let vehicleApiInFlight = $state(false);
	let vehicleApiFailed = $state(false);

	function handleVehicleApiStart() {
		vehicleApiInFlight = true;
		vehicleApiFailed = false;
	}

	function handleVehicleApiEnd(success: boolean) {
		vehicleApiInFlight = false;
		vehicleApiFailed = !success;
	}

	let batchActive = $derived(deviceId ? batchPush.isActive(deviceId) : false);
	const sync = createSyncStatus(
		() => !isDeviceOffline && (loadingBrandValues || vehicleApiInFlight || batchActive || schemaRevalStatus === 'revalidating'),
		() => !isDeviceOffline && !loadingBrandValues && !vehicleApiInFlight && !batchActive && !brandValuesFetchFailed && !vehicleApiFailed &&
			schemaRevalStatus !== 'revalidating' && schemaRevalStatus !== 'failed'
	);
</script>

<div class="mx-auto max-w-2xl xl:max-w-3xl space-y-6">
	<div class="px-4">
		<h2 class="flex items-baseline gap-3 text-[24px] font-medium leading-[32px] tracking-[-0.16px] text-[var(--sl-text-1)]">
			<span>Vehicle</span>
			<SyncStatusIndicator status={sync.status} onRefresh={() => fetchBrandValues()} />
		</h2>
		<p class="mt-0.5 text-[0.8125rem] font-[450] text-[var(--sl-text-2)]">Fingerprint and platform selection</p>
	</div>

	{#if deviceId}
		<div class="px-4">
			<p class="text-[0.9375rem] font-medium text-[var(--sl-text-1)]">Vehicle</p>
		</div>
		<VehicleSelector {deviceId} onApiStart={handleVehicleApiStart} onApiEnd={handleVehicleApiEnd} />

		{#if brandSettings.length > 0}
			<div class="px-4">
				<p class="text-[0.9375rem] font-medium text-[var(--sl-text-1)]">{brandData?.title ?? currentBrand}</p>
				{#if brandData?.description}
					<p class="mt-0.5 text-[0.8125rem] font-[450] text-[var(--sl-text-2)]">{brandData.description}</p>
				{/if}
			</div>
			<div class="overflow-hidden rounded-xl border border-[var(--sl-border)] bg-[var(--sl-bg-surface)]">
				{#each brandSettings as item, i (item.key)}
					<SchemaItemRenderer {deviceId} {item} loadingValues={loadingBrandValues} isLast={i === brandSettings.length - 1} />
				{/each}
			</div>
		{/if}
	{/if}
</div>
