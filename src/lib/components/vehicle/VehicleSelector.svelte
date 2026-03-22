<script lang="ts">
	import { onMount } from 'svelte';
	import { deviceState } from '$lib/stores/device.svelte';
	import { getCarList, setDeviceParams, fetchSettingsAsync } from '$lib/api/device';
	import { logtoClient } from '$lib/logto/auth.svelte';
	import { decodeParamValue, encodeParamValue } from '$lib/utils/device';
	import { loadCachedValues, getLastKnownCommit } from '$lib/stores/valuesCache';
	import { schemaState } from '$lib/stores/schema.svelte';
	import { ChevronRight, ChevronDown, X, Loader2 } from 'lucide-svelte';

	import CarSelectionModal from './CarSelectionModal.svelte';
	import ConfirmationModal from '$lib/components/ConfirmationModal.svelte';

	let { deviceId, onApiStart, onApiEnd } = $props<{
		deviceId: string;
		onApiStart?: () => void;
		onApiEnd?: (success: boolean) => void;
	}>();

	// Module-level CarList cache (survives component re-mounts during SPA navigation)
	const carListCache: Record<string, Record<string, any>> = (globalThis as any).__carListCache ??= {};

	// localStorage cache for carList (survives full page refreshes)
	const CARLIST_STORAGE_KEY = `sunnylink_carlist_${deviceId}`;

	function loadCarListFromStorage(): Record<string, any> | null {
		try {
			const raw = localStorage.getItem(CARLIST_STORAGE_KEY);
			if (!raw) return null;
			const parsed = JSON.parse(raw);
			carListCache[deviceId] = parsed;
			return parsed;
		} catch { return null; }
	}

	function saveCarListToStorage(list: Record<string, any>) {
		try { localStorage.setItem(CARLIST_STORAGE_KEY, JSON.stringify(list)); } catch {}
	}

	let carList = $state<Record<string, any> | null>(carListCache[deviceId] ?? loadCarListFromStorage());
	let isFetchingCarList = $state(false);
	let hasAttemptedAutoFetch = $state(carList ? true : false);
	let modalOpen = $state(false);
	let detailsOpen = $state(false);

	// Confirmation Modal State
	let confirmOpen = $state(false);
	let isClearing = $state(false);

	let carPlatformBundle = $derived.by(() => {
		const val = deviceState.deviceValues[deviceId]?.CarPlatformBundle as {
			name: string;
			[key: string]: any;
		} | null;
		if (!val) return null;
		if (Object.keys(val).length === 0) return null;
		return val;
	});

	let carFingerprint = $derived(
		(deviceState.deviceValues[deviceId]?.CarFingerprint as string) ||
			(deviceState.deviceValues[deviceId]?._ExtractedFingerprint as string) ||
			''
	);

	function tryExtractFingerprintFromCache(did: string): void {
		const vals = deviceState.deviceValues[did];
		if (!vals) return;
		if (vals['CarFingerprint'] || vals['_ExtractedFingerprint']) return;
		const persistentVal = vals['CarParamsPersistent'];
		if (!persistentVal || typeof persistentVal !== 'string') return;
		try {
			const binary = atob(persistentVal);
			const matches = binary.match(/(?=[A-Z0-9]*_)[A-Z0-9_]{4,}/g);
			if (matches?.[0]) {
				vals['_ExtractedFingerprint'] = matches[0];
			}
		} catch {}
	}

	// Synchronous cache hydration
	{
		const existing = deviceState.deviceValues[deviceId] ?? {};
		const vehicleKeys = ['CarPlatformBundle', 'CarFingerprint', 'CarParamsPersistent'];
		const missingVehicleKeys = vehicleKeys.some(k => existing[k] === undefined);
		if (missingVehicleKeys) {
			const commit = (existing['GitCommit'] as string) ||
				schemaState.schemas[deviceId]?.schema_version ||
				getLastKnownCommit(deviceId);
			if (commit) {
				const cached = loadCachedValues(deviceId, commit);
				if (cached) {
					if (!deviceState.deviceValues[deviceId]) deviceState.deviceValues[deviceId] = {};
					const vals = deviceState.deviceValues[deviceId];
					for (const key of vehicleKeys) {
						if (vals[key] === undefined && cached[key] !== undefined) {
							vals[key] = cached[key];
						}
					}
				}
			}
		}
	}

	if (deviceState.deviceValues[deviceId]) {
		tryExtractFingerprintFromCache(deviceId);
	}

	// Whether we have any cached vehicle data (for showing content vs skeleton)
	let hasCachedValues = $derived(
		deviceState.deviceValues[deviceId]?.['CarPlatformBundle'] !== undefined ||
		deviceState.deviceValues[deviceId]?.['CarFingerprint'] !== undefined ||
		deviceState.deviceValues[deviceId]?.['_ExtractedFingerprint'] !== undefined
	);

	let isLoadingValues = $state(!hasCachedValues);
	let isRevalidatingValues = $state(false);

	async function fetchValues() {
		if (!deviceId || !logtoClient) return;

		// SWR: show cached data immediately, always revalidate in background
		const isColdLoad = !hasCachedValues;
		if (isColdLoad) isLoadingValues = true;
		else isRevalidatingValues = true;

		onApiStart?.();
		const token = await logtoClient.getIdToken();
		if (!token) {
			isLoadingValues = false;
			isRevalidatingValues = false;
			return;
		}

		try {
			const requestedKeys = ['CarPlatformBundle', 'CarFingerprint', 'CarParamsPersistent'];
			const res = await fetchSettingsAsync(deviceId, requestedKeys, token);
			if (res.error) {
				console.error('[VehicleSelector] Failed to fetch vehicle params:', res.error);
				onApiEnd?.(false);
				return;
			}
			if (res.items) {
				if (!deviceState.deviceValues[deviceId]) deviceState.deviceValues[deviceId] = {};
				const returnedKeys = new Set(res.items.map(i => i.key));

				for (const item of res.items) {
					if (item.key === 'CarPlatformBundle') {
						const val = decodeParamValue(item);
						try {
							deviceState.deviceValues[deviceId]['CarPlatformBundle'] =
								typeof val === 'string' ? JSON.parse(val) : val;
						} catch (e) {
							console.warn('Failed to parse CarPlatformBundle', e);
						}
					} else if (item.key === 'CarFingerprint') {
						deviceState.deviceValues[deviceId]['CarFingerprint'] = decodeParamValue(item);
					} else if (item.key === 'CarParamsPersistent') {
						try {
							const base64 = item.value;
							if (base64) {
								const binary = atob(base64);
								const matches = binary.match(/(?=[A-Z0-9]*_)[A-Z0-9_]{4,}/g);
								if (matches?.[0]) {
									deviceState.deviceValues[deviceId]['_ExtractedFingerprint'] = matches[0];
								}
							}
						} catch (e) {
							console.warn('Failed to parse CarParamsPersistent', e);
						}
					}
				}

				// Clear stale values for keys the device no longer has
				for (const key of requestedKeys) {
					if (!returnedKeys.has(key)) {
						deviceState.deviceValues[deviceId][key] = null;
					}
				}
			}
			onApiEnd?.(true);
		} catch (e) {
			console.error('Failed to fetch vehicle params', e);
			onApiEnd?.(false);
		} finally {
			isLoadingValues = false;
			isRevalidatingValues = false;
		}
	}

	// Reactive auto-fetch CarList
	$effect(() => {
		if (carFingerprint && !carPlatformBundle && !carList && !isFetchingCarList && !hasAttemptedAutoFetch) {
			hasAttemptedAutoFetch = true;
			(async () => {
				isFetchingCarList = true;
				try {
					const token = await logtoClient?.getIdToken();
					if (token) {
						const list = await getCarList(deviceId, token);
						if (list) { carList = list; carListCache[deviceId] = list; saveCarListToStorage(list); }
					}
				} catch (e) {
					console.error('Effect fetch failed', e);
				} finally {
					isFetchingCarList = false;
				}
			})();
		}
	});

	onMount(() => { fetchValues(); });

	async function handleOpen() {
		modalOpen = true;
		if (!carList && !isFetchingCarList) {
			isFetchingCarList = true;
			try {
				const token = await logtoClient?.getIdToken();
				if (token) {
					const list = await getCarList(deviceId, token);
					if (list) {
						carList = list;
						carListCache[deviceId] = list;
						saveCarListToStorage(list);
					}
				}
			} finally {
				isFetchingCarList = false;
			}
		}
	}

	function requestClear() { confirmOpen = true; }

	async function handleClearConfirm() {
		if (!deviceId) return;

		// Optimistic: clear UI instantly, close modal, fire API in background
		const previousBundle = deviceState.deviceValues[deviceId]?.['CarPlatformBundle'] ?? null;
		if (deviceState.deviceValues[deviceId]) {
			deviceState.deviceValues[deviceId]['CarPlatformBundle'] = null;
		}
		confirmOpen = false;

		// Background API call
		onApiStart?.();
		try {
			const token = await logtoClient?.getIdToken();
			if (!token) throw new Error('Not authenticated');
			const encodedValue = encodeParamValue({ key: 'CarPlatformBundle', value: '{}', type: 'Json' });
			const res = await setDeviceParams(deviceId, [{ key: 'CarPlatformBundle', value: String(encodedValue), is_compressed: false }], token, 5000);
			if (res.error) {
				const errorMsg = typeof res.error === 'object' && res.error !== null
					? (res.error as any).detail || (res.error as any).message || 'Unknown API error'
					: 'Unknown API error';
				throw new Error(errorMsg);
			}
			onApiEnd?.(true);
		} catch (e: any) {
			if (!e.message?.includes('Timeout')) {
				// Real error — rollback
				console.error('Failed to clear selection', e);
				if (deviceState.deviceValues[deviceId]) {
					deviceState.deviceValues[deviceId]['CarPlatformBundle'] = previousBundle;
				}
				onApiEnd?.(false);
			} else {
				// Timeout: device likely received it, keep optimistic state
				onApiEnd?.(true);
			}
		}
	}

	async function handleSelect(name: string, data: any) {
		if (!deviceId) return;

		// Optimistic: update UI instantly, close modal, fire API in background
		const previousBundle = deviceState.deviceValues[deviceId]?.['CarPlatformBundle'] ?? null;
		const { id, ...rest } = data;
		const bundle = { ...rest, name };
		if (!deviceState.deviceValues[deviceId]) deviceState.deviceValues[deviceId] = {};
		deviceState.deviceValues[deviceId]['CarPlatformBundle'] = bundle;
		modalOpen = false;

		// Background API call
		onApiStart?.();
		try {
			const token = await logtoClient?.getIdToken();
			if (!token) throw new Error('Not authenticated');
			const encodedValue = encodeParamValue({ key: 'CarPlatformBundle', value: JSON.stringify(bundle), type: 'Json' });
			const res = await setDeviceParams(deviceId, [{ key: 'CarPlatformBundle', value: String(encodedValue), is_compressed: false }], token, 5000);
			if (res.error) {
				const errorMsg = typeof res.error === 'object' && res.error !== null
					? (res.error as any).detail || (res.error as any).message || 'Unknown API error'
					: 'Unknown API error';
				throw new Error(errorMsg);
			}
			onApiEnd?.(true);
		} catch (e: any) {
			if (!e.message?.includes('Timeout')) {
				// Real error — rollback
				console.error('Failed to set vehicle', e);
				if (deviceState.deviceValues[deviceId]) {
					deviceState.deviceValues[deviceId]['CarPlatformBundle'] = previousBundle;
				}
				onApiEnd?.(false);
			} else {
				// Timeout: device likely received it, keep optimistic state
				onApiEnd?.(true);
			}
		}
	}

	let isMock = $derived(carFingerprint === 'MOCK' || !carFingerprint);
	let mode = $derived.by((): 'auto' | 'manual' | 'none' => {
		if (carPlatformBundle) return 'manual';
		if (!isMock) return 'auto';
		return 'none';
	});

	// Display values
	let vehicleName = $derived.by(() => {
		if (isLoadingValues) return 'Loading...';
		if (carPlatformBundle) return carPlatformBundle.name;
		if (!isMock) return carFingerprint.replace(/_/g, ' ');
		return 'No vehicle detected';
	});

	let statusLabel = $derived.by(() => {
		if (isLoadingValues) return 'Checking status';
		if (carPlatformBundle) return 'Manually selected';
		if (!isMock) return 'Auto-detected';
		return 'Not fingerprinted';
	});

	// Matching cars from carList
	let matchingCars = $derived.by(() => {
		if (carPlatformBundle || !carFingerprint || !carList) return [];
		return Object.entries(carList)
			.filter(([, data]) => (data as any).platform === carFingerprint)
			.map(([name, data]) => ({ name, ...(data as object) }));
	});

	let dotColor = $derived.by(() => {
		if (mode === 'auto') return 'bg-emerald-500';
		if (mode === 'manual') return 'bg-blue-500';
		return 'bg-yellow-500';
	});
</script>

<!-- Vehicle Status Card -->
<div class="overflow-hidden rounded-xl border border-[var(--sl-border)] bg-[var(--sl-bg-surface)]">
	<!-- Main status row -->
	<div class="flex items-center gap-4 px-4 py-3">
		<!-- Color dot -->
		<div class="flex shrink-0 items-center">
			{#if isLoadingValues}
				<Loader2 size={16} class="animate-spin text-[var(--sl-text-3)]" />
			{:else}
				<div class="h-2.5 w-2.5 rounded-full {dotColor}"></div>
			{/if}
		</div>

		<!-- Vehicle info -->
		<div class="min-w-0 flex-1">
			<div class="text-[0.875rem] font-medium text-[var(--sl-text-1)]">
				{vehicleName}
			</div>
			<div class="text-[0.8125rem] text-[var(--sl-text-2)]">
				{statusLabel}{#if !isLoadingValues && carFingerprint && !carPlatformBundle}
					<span class="text-[var(--sl-text-3)]"> · {carFingerprint}</span>
				{/if}
			</div>
		</div>

		<!-- Actions -->
		<div class="flex shrink-0 items-center gap-2">
			{#if !isLoadingValues}
				{#if mode === 'manual'}
					<button
						class="rounded-lg px-3 py-1.5 text-[0.8125rem] font-medium text-red-400 transition-colors hover:bg-red-500/10"
						onclick={(e) => { e.stopPropagation(); requestClear(); }}
					>
						Remove
					</button>
				{/if}
				<button
					class="flex items-center gap-1 rounded-lg px-3 py-1.5 text-[0.8125rem] font-medium text-[var(--sl-text-2)] transition-colors hover:bg-[var(--sl-bg-elevated)] hover:text-[var(--sl-text-1)]"
					onclick={handleOpen}
				>
					{mode === 'manual' ? 'Change' : 'Select'}
					<ChevronRight size={14} />
				</button>
			{/if}
		</div>
	</div>

	<!-- Details disclosure -->
	{#if !isLoadingValues && (carFingerprint || carPlatformBundle)}
		<div class="border-t border-[var(--sl-border-muted)]">
			<button
				class="flex w-full items-center gap-2 px-4 py-2.5 text-[0.8125rem] text-[var(--sl-text-3)] transition-colors hover:bg-[var(--sl-bg-elevated)] hover:text-[var(--sl-text-2)]"
				onclick={() => detailsOpen = !detailsOpen}
			>
				<ChevronDown size={14} class="transition-transform {detailsOpen ? '' : '-rotate-90'}" />
				View details
			</button>

			{#if detailsOpen}
				<div class="border-t border-[var(--sl-border-muted)] px-4 py-3 text-[0.8125rem]">
					{#if carPlatformBundle}
						<div class="space-y-2">
							<div class="flex justify-between">
								<span class="text-[var(--sl-text-3)]">Platform</span>
								<span class="font-mono text-[var(--sl-text-1)]">{carPlatformBundle.name}</span>
							</div>
							{#if carPlatformBundle.make}
								<div class="flex justify-between">
									<span class="text-[var(--sl-text-3)]">Make</span>
									<span class="text-[var(--sl-text-1)]">{carPlatformBundle.make}</span>
								</div>
							{/if}
							{#if carPlatformBundle.model}
								<div class="flex justify-between">
									<span class="text-[var(--sl-text-3)]">Model</span>
									<span class="text-[var(--sl-text-1)]">{carPlatformBundle.model}</span>
								</div>
							{/if}
							{#if carPlatformBundle.year}
								<div class="flex justify-between">
									<span class="text-[var(--sl-text-3)]">Year</span>
									<span class="text-[var(--sl-text-1)]">
										{Array.isArray(carPlatformBundle.year) ? carPlatformBundle.year.join(', ') : carPlatformBundle.year}
									</span>
								</div>
							{/if}
							{#if carPlatformBundle.package}
								<div class="flex justify-between">
									<span class="text-[var(--sl-text-3)]">Package</span>
									<span class="text-[var(--sl-text-1)]">{carPlatformBundle.package}</span>
								</div>
							{/if}
						</div>
					{:else}
						<div class="space-y-2">
							<div class="flex justify-between">
								<span class="text-[var(--sl-text-3)]">Fingerprint</span>
								<span class="font-mono text-[var(--sl-text-1)]">{carFingerprint}</span>
							</div>
							{#if matchingCars.length > 0}
								<div class="flex justify-between">
									<span class="text-[var(--sl-text-3)]">Match</span>
									<span class="text-[var(--sl-text-1)]">{matchingCars.map(c => c.name).join(', ')}</span>
								</div>
							{/if}
						</div>
					{/if}

					<!-- Raw config -->
					<details class="mt-3">
						<summary class="cursor-pointer font-mono text-xs text-[var(--sl-text-3)] hover:text-[var(--sl-text-2)]">
							Raw configuration
						</summary>
						<pre class="mt-2 overflow-x-auto rounded-lg bg-[var(--sl-bg-input)] p-3 text-xs text-[var(--sl-text-2)]">{JSON.stringify(carPlatformBundle || matchingCars, null, 2)}</pre>
					</details>
				</div>
			{/if}
		</div>
	{/if}
</div>

<CarSelectionModal bind:open={modalOpen} {carList} onSelect={handleSelect} />

<ConfirmationModal
	bind:open={confirmOpen}
	title="Remove Manual Selection"
	message="Are you sure you want to remove the manual vehicle selection? This will revert the device to automatic fingerprinting."
	confirmText="Remove"
	variant="danger"
	isProcessing={isClearing}
	onConfirm={handleClearConfirm}
/>
