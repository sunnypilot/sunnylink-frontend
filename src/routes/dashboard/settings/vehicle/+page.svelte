<script lang="ts">
	import { deviceState } from '$lib/stores/device.svelte';
	import { schemaState } from '$lib/stores/schema.svelte';
	import { logtoClient } from '$lib/logto/auth.svelte';
	import { fetchSettingsAsync } from '$lib/api/device';
	import { decodeParamValue } from '$lib/utils/device';
	import { createSyncStatus } from '$lib/utils/syncStatus.svelte';
	import { batchPush } from '$lib/stores/batchPush.svelte';
	import VehicleSelector from '$lib/components/vehicle/VehicleSelector.svelte';
	import SchemaPanel from '$lib/components/schema/SchemaPanel.svelte';
	import SettingsPageShell from '$lib/components/SettingsPageShell.svelte';
	import type { Panel, SchemaItem } from '$lib/types/schema';

	let deviceId = $derived(deviceState.selectedDeviceId);
	let isDeviceOffline = $derived(
		deviceId
			? deviceState.onlineStatuses[deviceId] === 'offline' ||
					deviceState.onlineStatuses[deviceId] === 'error'
			: false
	);

	// Load schema if not already loaded
	$effect(() => {
		if (
			deviceId &&
			logtoClient &&
			!schemaState.schemas[deviceId] &&
			!schemaState.loading[deviceId] &&
			!schemaState.schemaUnavailable[deviceId]
		) {
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

	// Determine current brand — mirrors device-side VehicleLayout.get_brand()
	let currentBrand = $derived.by(() => {
		if (!deviceId) return '';
		// Primary: CarPlatformBundle.brand (available immediately after vehicle selection)
		const bundle = deviceState.deviceValues[deviceId]?.CarPlatformBundle as {
			brand?: string;
		} | null;
		if (bundle?.brand) return bundle.brand;
		// Fallback: capabilities.brand (from CarParamsPersistent, available after fingerprint)
		return schemaState.capabilities[deviceId]?.brand ?? '';
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

	async function fetchBrandValues(force = false) {
		if (!deviceId || !logtoClient || brandSettings.length === 0) return;

		const existing = deviceState.deviceValues[deviceId] ?? {};
		const keys = brandSettings.map((item) => item.key);
		const missing = force ? keys : keys.filter((k) => existing[k] === undefined);
		if (missing.length === 0) return;

		loadingBrandValues = true;
		brandValuesFetchFailed = false;
		try {
			const token = await logtoClient.getIdToken();
			if (!token) return;

			const response = await fetchSettingsAsync(deviceId, missing, token);

			if (response.items) {
				const vals = (deviceState.deviceValues[deviceId] ??= {});
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

			const vals = (deviceState.deviceValues[deviceId] ??= {});
			for (const item of brandSettings) {
				if (vals[item.key] === undefined) {
					if (item.widget === 'toggle') vals[item.key] = false;
					else if (item.widget === 'option' || item.widget === 'multiple_button')
						vals[item.key] = item.options?.[0]?.value ?? '';
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
		deviceId ? (schemaState.revalidationStatus[deviceId] ?? null) : null
	);

	// Vehicle API in-flight tracking (select/remove operations)
	let vehicleApiInFlight = $state(false);
	let vehicleApiFailed = $state(false);

	function handleVehicleApiStart() {
		vehicleApiInFlight = true;
		vehicleApiFailed = false;
	}

	async function handleVehicleApiEnd(success: boolean) {
		vehicleApiInFlight = false;
		vehicleApiFailed = !success;
		// After a successful vehicle change, refresh capabilities to get the new brand
		if (success && deviceId && logtoClient) {
			try {
				const token = await logtoClient.getIdToken();
				if (token) await schemaState.refreshCapabilities(deviceId, token);
			} catch {
				/* capabilities refresh is best-effort */
			}
		}
	}

	let batchActive = $derived(deviceId ? batchPush.isActive(deviceId) : false);
	const sync = createSyncStatus(
		() =>
			!isDeviceOffline &&
			(loadingBrandValues ||
				vehicleApiInFlight ||
				batchActive ||
				schemaRevalStatus === 'revalidating'),
		() =>
			!isDeviceOffline &&
			!loadingBrandValues &&
			!vehicleApiInFlight &&
			!batchActive &&
			!brandValuesFetchFailed &&
			!vehicleApiFailed &&
			schemaRevalStatus !== 'revalidating' &&
			schemaRevalStatus !== 'failed'
	);
</script>

<SettingsPageShell
	title="Vehicle"
	description="Fingerprint and platform selection"
	syncStatus={sync.status}
	onRefresh={() => {
		fetchBrandValues(true);
		if (deviceId && logtoClient) {
			logtoClient.getIdToken().then((token) => {
				if (token && deviceId) schemaState.refreshCapabilities(deviceId, token);
			});
		}
	}}
>
	{#if deviceId}
		<!-- Vehicle section: selector card -->
		<div class="px-4">
			<p class="text-[0.9375rem] font-medium text-[var(--sl-text-1)]">Vehicle</p>
		</div>
		<div class="mt-3">
			<VehicleSelector
				{deviceId}
				onApiStart={handleVehicleApiStart}
				onApiEnd={handleVehicleApiEnd}
			/>
		</div>

		{#if brandSettings.length > 0}
			{@const brandPanel: Panel = {
				id: `vehicle-${currentBrand}`,
				label: brandData?.title ?? currentBrand,
				icon: 'vehicle',
				order: 0,
				remote_configurable: true,
				description: brandData?.description,
				items: brandSettings as SchemaItem[]
			}}
			<!-- Brand settings: schema-driven via SchemaPanel for visual + behavioral parity
			     with all other settings pages (enablement rules, badges, etc.). -->
			<div class="mt-12">
				<div class="px-4">
					<p class="text-[0.9375rem] font-medium text-[var(--sl-text-1)]">
						{brandData?.title ?? currentBrand}
					</p>
					{#if brandData?.description}
						<p class="mt-2 text-[0.8125rem] font-[450] text-[var(--sl-text-2)]">
							{brandData.description}
						</p>
					{/if}
				</div>
				<div class="mt-3">
					<SchemaPanel {deviceId} panel={brandPanel} loadingValues={loadingBrandValues} />
				</div>
			</div>
		{/if}
	{/if}
</SettingsPageShell>
