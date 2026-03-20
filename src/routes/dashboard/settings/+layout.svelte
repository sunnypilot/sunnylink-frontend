<script lang="ts">
	import { deviceState } from '$lib/stores/device.svelte';
	import { schemaState } from '$lib/stores/schema.svelte';
	import { preferences } from '$lib/stores/preferences.svelte';
	import { logtoClient } from '$lib/logto/auth.svelte';
	import { checkDeviceStatus } from '$lib/api/device';
	import { loadCachedValues, saveCachedValues, getLastKnownCommit, setLastKnownCommit, updateCachedValue } from '$lib/stores/valuesCache';
	import { fetchSettingsAsync, setDeviceParams } from '$lib/api/device';
	import { decodeParamValue, encodeParamValue } from '$lib/utils/device';
	import { pendingChanges } from '$lib/stores/pendingChanges.svelte';
	import type { Panel } from '$lib/types/schema';
	import type { PendingChange } from '$lib/stores/pendingChanges.svelte';
	import { WifiOff, AlertTriangle, Shield, Info, Wifi, RefreshCw } from 'lucide-svelte';
	import SyncStatusBanner from '$lib/components/SyncStatusBanner.svelte';
	import { toastState } from '$lib/stores/toast.svelte';
	import { formatRelativeTime } from '$lib/utils/time';

	let { children, data } = $props();

	let retrying = $state(false);
	let lastRetryAt = $state<number | null>(null);
	let retryFailed = $state(false);
	let wasOffline = $state(false);

	let deviceId = $derived(deviceState.selectedDeviceId);
	let deviceStatus = $derived(deviceId ? deviceState.onlineStatuses[deviceId] : undefined);
	let isOnline = $derived(deviceStatus === 'online');
	let isDeviceUnavailable = $derived(deviceId ? !isOnline : false);

	let isLoading = $derived(deviceStatus === 'loading' || deviceStatus === undefined);
	let isError = $derived(deviceStatus === 'error');

	// Track when device transitions from offline → online for success toast + auto-flush
	$effect(() => {
		if (isOnline && wasOffline) {
			wasOffline = false;
			toastState.show('Device reconnected', 'success');
			// Auto-flush any queued changes now that device is back online
			if (deviceId) flushPendingChanges(deviceId);
		}
		if (isDeviceUnavailable && !isLoading) {
			wasOffline = true;
		}
	});

	// Also flush on initial load if device is online and has pending changes
	$effect(() => {
		if (deviceId && isOnline && pendingChanges.hasPending(deviceId)) {
			flushPendingChanges(deviceId);
		}
	});

	/** Flush all pending changes to the device via the settings API */
	async function flushPendingChanges(did: string) {
		if (!logtoClient || pendingChanges.isFlushing(did)) return;

		const token = await logtoClient.getIdToken();
		if (!token) return;

		const count = await pendingChanges.flush(did, async (change: PendingChange) => {
			// Infer param type from device settings metadata
			const deviceParams = deviceState.deviceSettings[did];
			const paramInfo = deviceParams?.find((p: any) => p.key === change.key);
			const type = paramInfo?.type || 'String';

			const encoded = encodeParamValue({ key: change.key, value: change.desiredValue, type });
			if (encoded === null) throw new Error('Failed to encode value');

			await setDeviceParams(did, [{ key: change.key, value: encoded }], token, 5000);

			// Update localStorage cache
			const gitCommit = (deviceState.deviceValues[did]?.['GitCommit'] as string) || '';
			if (gitCommit) updateCachedValue(did, gitCommit, change.key, change.desiredValue);
		});

		if (count > 0) {
			toastState.show(`Synced ${count} queued change${count === 1 ? '' : 's'}`, 'success');
		}

		const failedCount = pendingChanges.failedCount(did);
		if (failedCount > 0) {
			toastState.show(`${failedCount} change${failedCount === 1 ? '' : 's'} failed to sync`, 'error');
		}
	}

	function retryFailedChanges() {
		if (!deviceId) return;
		const failed = pendingChanges.getByStatus(deviceId, 'failed');
		for (const entry of failed) {
			// Re-enqueue as pending so the next flush picks them up
			pendingChanges.enqueue(deviceId, entry.key, entry.desiredValue, entry.previousValue);
		}
		flushPendingChanges(deviceId);
	}

	// Synchronous cache hydration — runs before first render.
	// Uses getLastKnownCommit() to break the chicken-and-egg.
	// Must be synchronous (not $effect) so cached values are available
	// for the first template render — prevents gray/empty toggles flash.
	function hydrateCacheSync(did: string) {
		if (!did) return;
		const schemaCommit = schemaState.schemas[did]?.schema_version;
		const valuesCommit = deviceState.deviceValues[did]?.['GitCommit'] as string | undefined;
		const lastKnown = getLastKnownCommit(did);
		const commit = valuesCommit || schemaCommit || lastKnown;
		if (!commit) return;

		const cached = loadCachedValues(did, commit);
		if (cached) {
			const existing = deviceState.deviceValues[did];
			if (!existing || Object.keys(existing).length === 0) {
				// No values yet — full hydration
				deviceState.deviceValues[did] = { ...cached };
			} else {
				// Merge: fill in any keys missing from the live store
				let merged = false;
				for (const key in cached) {
					if (existing[key] === undefined) {
						existing[key] = cached[key];
						merged = true;
					}
				}
				if (merged) deviceState.deviceValues[did] = { ...existing };
			}
		}
	}

	// Hydrate immediately for the current device (synchronous, before first render)
	if (deviceState.selectedDeviceId) {
		hydrateCacheSync(deviceState.selectedDeviceId);
	}

	// Also re-hydrate reactively when device changes (for device switching)
	$effect(() => {
		if (deviceId) hydrateCacheSync(deviceId);
	});

	// Save values to cache whenever they change and device is online.
	// Also persists gitCommit separately for next-session cache hydration.
	$effect(() => {
		if (!deviceId || !isOnline) return;
		const values = deviceState.deviceValues[deviceId];
		if (!values || Object.keys(values).length === 0) return;
		const gitCommit = (values['GitCommit'] as string) || '';
		if (gitCommit) {
			saveCachedValues(deviceId, gitCommit, values);
			setLastKnownCommit(deviceId, gitCommit);
		}
	});

	// Background prefetch: when schema is loaded and device is online,
	// fetch ALL panel keys + vehicle_settings keys in the background so every
	// settings page loads instantly from cache on subsequent visits or F5 refresh.
	let prefetchDone = $state<Record<string, boolean>>({});

	$effect(() => {
		if (!deviceId || !isOnline || !logtoClient) return;
		if (prefetchDone[deviceId]) return;
		const schema = schemaState.schemas[deviceId];
		if (!schema?.panels) return;

		// Collect all keys from all panels
		const allKeys: string[] = [];
		function addItem(item: { key: string; sub_items?: { key: string }[] }) {
			allKeys.push(item.key);
			for (const sub of item.sub_items ?? []) allKeys.push(sub.key);
		}
		for (const panel of schema.panels) {
			for (const item of panel.items) addItem(item);
			for (const sp of panel.sub_panels ?? []) {
				for (const item of sp.items) addItem(item);
			}
		}

		// Also collect vehicle_settings keys (brand-specific settings)
		const caps = schemaState.capabilities[deviceId];
		const brand = caps?.brand ?? '';
		const vehicleItems = brand && schema.vehicle_settings ? (schema.vehicle_settings[brand] ?? []) : [];
		for (const item of vehicleItems) addItem(item);

		// Also prefetch vehicle detection params (used by VehicleSelector)
		allKeys.push('CarPlatformBundle', 'CarFingerprint', 'CarParamsPersistent');

		// Filter to keys we don't have yet
		const existing = deviceState.deviceValues[deviceId] ?? {};
		const missing = allKeys.filter((k) => existing[k] === undefined);
		if (missing.length === 0) {
			prefetchDone[deviceId] = true;
			return;
		}

		// Background fetch — silent, non-blocking
		(async () => {
			try {
				const token = await logtoClient!.getIdToken();
				if (!token) return;

				// Chunk into batches of 10 (matching existing pattern)
				const chunks: string[][] = [];
				for (let i = 0; i < missing.length; i += 10) {
					chunks.push(missing.slice(i, i + 10));
				}

				await Promise.all(
					chunks.map(async (chunk) => {
						try {
							const response = await fetchSettingsAsync(deviceId!, chunk, token);
							if (response.items) {
								const vals = deviceState.deviceValues[deviceId!] ??= {};
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
						} catch {}
					})
				);

				// Fill defaults for keys the device didn't return
				const vals = deviceState.deviceValues[deviceId!] ??= {};
				const allSchemaItems = [
					...schema.panels.flatMap((p: Panel) => [...p.items, ...(p.sub_panels ?? []).flatMap((sp: any) => sp.items)]),
					...vehicleItems
				];
				for (const item of allSchemaItems) {
					if (vals[item.key] === undefined) {
						if (item.widget === 'toggle') vals[item.key] = false;
						else if (item.widget === 'option' || item.widget === 'multiple_button') vals[item.key] = item.options?.[0]?.value ?? '';
						else vals[item.key] = '';
					}
				}

				prefetchDone[deviceId!] = true;
			} catch {}
		})();
	});

	// Educational banner
	// Shown if user hasn't permanently dismissed AND hasn't session-dismissed.
	let sessionDismissed = $state(false);
	let showOnlineHelp = $derived(
		!!deviceId && preferences.showDeviceOnlineHelp && !sessionDismissed
	);

	function dismissHelp(permanent: boolean) {
		if (permanent) {
			preferences.showDeviceOnlineHelp = false;
		}
		sessionDismissed = true;
	}

	async function handleRetry() {
		if (!deviceId || !logtoClient) return;
		retrying = true;
		retryFailed = false;
		try {
			const token = await logtoClient.getIdToken();
			if (token) await checkDeviceStatus(deviceId, token, true);
			// Check if still offline after retry
			const statusAfter = deviceState.onlineStatuses[deviceId];
			if (statusAfter !== 'online') {
				retryFailed = true;
				lastRetryAt = Date.now();
			}
		} catch {
			retryFailed = true;
			lastRetryAt = Date.now();
		} finally {
			retrying = false;
		}
	}
</script>

<!-- Educational banner — inline, dismissible, non-blocking, preference-driven -->
{#if showOnlineHelp}
	<div class="mx-auto mb-4 w-full max-w-2xl xl:max-w-3xl">
		<div class="rounded-xl border border-[var(--sl-border)] bg-[var(--sl-bg-surface)]">
			<div class="flex items-center gap-3 border-b border-[var(--sl-border)] px-4 py-3">
				<div class="rounded-full bg-primary/10 p-1.5 text-primary">
					<Wifi size={16} />
				</div>
				<p class="flex-1 text-sm font-medium text-[var(--sl-text-1)]">Device Connection Required</p>
				<button
					class="btn btn-ghost btn-xs text-[var(--sl-text-2)]"
					onclick={() => dismissHelp(false)}
				>
					Dismiss
				</button>
			</div>
			<div class="space-y-2 px-4 py-3">
				<div class="flex gap-2.5">
					<Shield class="mt-0.5 shrink-0 text-primary" size={16} />
					<p class="text-[0.8125rem] font-[450] text-[var(--sl-text-2)]">
						We do <strong class="text-[var(--sl-text-1)]">not</strong> store your device settings on our servers. A direct device connection is required.
					</p>
				</div>
				<div class="flex gap-2.5">
					<Info class="mt-0.5 shrink-0 text-primary" size={16} />
					<p class="text-[0.8125rem] font-[450] text-[var(--sl-text-2)]">
						Backups are encrypted with your device's private key. Only your device can decrypt them.
					</p>
				</div>
			</div>
			<div class="border-t border-[var(--sl-border)] px-4 py-2.5">
				<label class="flex cursor-pointer items-center gap-2">
					<input
						type="checkbox"
						class="checkbox checkbox-xs checkbox-primary border-slate-500"
						onchange={(e: Event) => {
							if ((e.target as HTMLInputElement).checked) dismissHelp(true);
						}}
					/>
					<span class="text-xs text-[var(--sl-text-2)]">Don't show again</span>
				</label>
			</div>
		</div>
	</div>
{/if}

<!-- Offline/error banner — inline above content, never replaces it -->
{#if deviceId && isDeviceUnavailable && !isLoading}
	<div class="mx-auto mb-4 w-full max-w-2xl xl:max-w-3xl">
		<div class="flex items-center gap-2.5 rounded-lg border px-4 py-2.5
			{isError ? 'border-orange-500/20 bg-orange-500/5' : 'border-yellow-500/20 bg-yellow-500/5'}">
			{#if isError}
				<AlertTriangle size={16} class="shrink-0 text-orange-400" />
				<div class="flex-1">
					<p class="text-sm text-orange-200/80">
						<span class="font-medium">Connection error</span> — Unable to reach device. Settings may be outdated.
					</p>
					{#if lastRetryAt}
						<p class="mt-0.5 text-[0.6875rem] text-orange-300/50">Checked {formatRelativeTime(lastRetryAt)}</p>
					{/if}
				</div>
			{:else}
				<WifiOff size={16} class="shrink-0 text-yellow-500" />
				<div class="flex-1">
					<p class="text-sm text-yellow-200/80">
						{#if retryFailed}
							<span class="font-medium">Still offline</span> — Device not reachable. Showing cached settings.
						{:else}
							<span class="font-medium">Offline</span> — Showing cached settings. Changes disabled until device is online.
						{/if}
					</p>
					{#if lastRetryAt}
						<p class="mt-0.5 text-[0.6875rem] text-yellow-300/50">Checked {formatRelativeTime(lastRetryAt)}</p>
					{/if}
				</div>
			{/if}
			<button
				class="btn btn-ghost btn-xs shrink-0 {isError ? 'text-orange-400' : 'text-yellow-400'}"
				disabled={retrying}
				onclick={handleRetry}
			>
				{#if retrying}
					<span class="loading loading-spinner loading-xs"></span>
					Checking...
				{:else}
					<RefreshCw size={14} />
					Retry
				{/if}
			</button>
		</div>
	</div>
{/if}

<!-- Sync status banner — pending/failed/drift indicators -->
{#if deviceId}
	<div class="mx-auto w-full max-w-2xl xl:max-w-3xl">
		<SyncStatusBanner {deviceId} onRetryFailed={retryFailedChanges} />
	</div>
{/if}

<!-- Always render children — never gate on device status.
     SchemaItemRenderer's pushValue() has its own offline guard.
     Cached values show instantly; fresh values stream in via background fetch. -->
{@render children()}
