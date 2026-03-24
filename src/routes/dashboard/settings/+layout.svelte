<script lang="ts">
	import { deviceState } from '$lib/stores/device.svelte';
	import { schemaState } from '$lib/stores/schema.svelte';
	import { preferences } from '$lib/stores/preferences.svelte';
	import { logtoClient } from '$lib/logto/auth.svelte';
	import { checkDeviceStatus } from '$lib/api/device';
	import { loadCachedValues, saveCachedValues, getLastKnownCommit, setLastKnownCommit, updateCachedValue } from '$lib/stores/valuesCache';
	import { detectDrift, filterMeaningfulDrift } from '$lib/utils/drift';
	import { driftStore } from '$lib/stores/driftStore.svelte';
	import { fetchSettingsAsync, setDeviceParams } from '$lib/api/device';
	import { decodeParamValue, encodeParamValue } from '$lib/utils/device';
	import { pendingChanges } from '$lib/stores/pendingChanges.svelte';
	import type { Panel } from '$lib/types/schema';
	import type { PendingChange } from '$lib/stores/pendingChanges.svelte';
	import { WifiOff, AlertTriangle, Shield, Info, Wifi, RefreshCw } from 'lucide-svelte';
	import SyncStatusBanner from '$lib/components/SyncStatusBanner.svelte';
	import { toastState } from '$lib/stores/toast.svelte';
	import { formatRelativeTime } from '$lib/utils/time';
	import { versionPoller } from '$lib/stores/versionPoller.svelte';
	import { statusPolling } from '$lib/stores/statusPolling.svelte';
	import { onDestroy } from 'svelte';

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

		const pending = pendingChanges.getByStatus(did, 'pending');
		if (pending.length === 0) return;

		pendingChanges.setFlushing(did, true);

		// Mark all as pushing
		for (const change of pending) pendingChanges.markPushing(did, change.key);

		// Encode all changes and batch into a single API call
		const payload: { key: string; value: string }[] = [];
		const encoded: PendingChange[] = [];
		for (const change of pending) {
			const deviceParams = deviceState.deviceSettings[did];
			const paramInfo = deviceParams?.find((p: any) => p.key === change.key);
			const type = paramInfo?.type || 'String';
			const enc = encodeParamValue({ key: change.key, value: change.desiredValue, type });
			if (enc !== null) {
				payload.push({ key: change.key, value: enc });
				encoded.push(change);
			} else {
				pendingChanges.markFailed(did, change.key, 'Failed to encode value');
			}
		}

		if (payload.length > 0) {
			try {
				await setDeviceParams(did, payload, token, 5000);

				// Success: mark all confirmed, update cache
				const gitCommit = (deviceState.deviceValues[did]?.['GitCommit'] as string) || '';
				for (const change of encoded) {
					pendingChanges.markConfirmed(did, change.key);
					if (gitCommit) updateCachedValue(did, gitCommit, change.key, change.desiredValue);
				}
			} catch (e) {
				// Batch failed: mark all as failed
				for (const change of encoded) {
					pendingChanges.markFailed(did, change.key, (e as Error)?.message || 'Failed');
				}
			}
		}

		pendingChanges.setFlushing(did, false);

		// Failed changes get a toast
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

	$effect(() => {
		if (deviceId && isOnline) {
			versionPoller.start({
				deviceId,
				onVersionChange: () => {
					// Version changed — invalidate prefetch and mark values stale
					// so next page visit re-fetches all keys (stale-while-revalidate)
					if (deviceId) {
						prefetchDone[deviceId] = false;
						deviceState.valuesStale[deviceId] = true;
						deviceState.valuesVerifiedThisSession[deviceId] = false;
					}
				}
			});
		} else {
			versionPoller.stop();
		}
	});
	onDestroy(() => versionPoller.stop());

	// Background prefetch: when schema is loaded and device is online,
	// fetch ALL panel keys + vehicle_settings keys in the background so every
	// settings page loads instantly from cache on subsequent visits or F5 refresh.
	let prefetchDone = $state<Record<string, boolean>>({});

	// Re-trigger global prefetch when valuesStale is set (manual refresh, version change)
	$effect(() => {
		if (deviceId && deviceState.valuesStale[deviceId]) {
			prefetchDone[deviceId] = false;
		}
	});

	$effect(() => {
		if (!deviceId || !isOnline || !logtoClient) return;
		if (prefetchDone[deviceId]) return;
		// Only run global prefetch when explicitly triggered (manual refresh or version change).
		// The stale watcher sets prefetchDone=false AND valuesStale=true.
		// Initial page load is handled by the category page's own fetch.
		if (!deviceState.valuesStale[deviceId]) return;
		const schema = schemaState.schemas[deviceId];
		if (!schema?.panels) return;

		// Collect all keys from all panels
		const allKeys: string[] = [];
		function addItem(item: { key: string; sub_items?: { key: string }[] }) {
			allKeys.push(item.key);
			for (const sub of item.sub_items ?? []) allKeys.push(sub.key);
		}
		for (const panel of schema.panels) {
			for (const item of panel.items ?? []) addItem(item);
			for (const sp of panel.sub_panels ?? []) {
				for (const item of sp.items) addItem(item);
			}
			for (const section of panel.sections ?? []) {
				for (const item of section.items) addItem(item);
				for (const sp of section.sub_panels ?? []) {
					for (const item of sp.items) addItem(item);
				}
			}
		}

		// Also collect vehicle_settings keys (brand-specific settings)
		const caps = schemaState.capabilities[deviceId];
		const brand = caps?.brand ?? '';
		const brandData = brand && schema.vehicle_settings ? schema.vehicle_settings[brand] : null;
		const vehicleItems = brandData?.items ?? [];
		for (const item of vehicleItems) addItem(item);

		// Also prefetch vehicle detection params (used by VehicleSelector)
		allKeys.push('CarPlatformBundle', 'CarFingerprint', 'CarParamsPersistent');

		const existing = deviceState.deviceValues[deviceId] ?? {};
		const uniqueKeys = [...new Set(allKeys)];

		// Snapshot current in-memory values SYNCHRONOUSLY before any async fetch updates them.
		// This captures what the user is currently seeing (from localStorage hydration or previous fetch).
		const prefetchCachedSnapshot: Record<string, unknown> = { ...existing };

		// Background fetch — always fetch all keys for global drift detection
		(async () => {
			try {
				const token = await logtoClient!.getIdToken();
				if (!token) return;

				// Chunk into batches of 10 (matching existing pattern)
				const chunks: string[][] = [];
				for (let i = 0; i < uniqueKeys.length; i += 10) {
					chunks.push(uniqueKeys.slice(i, i + 10));
				}

				const freshValues: Record<string, unknown> = {};
				await Promise.all(
					chunks.map(async (chunk) => {
						try {
							const response = await fetchSettingsAsync(deviceId!, chunk, token);
							if (response.items) {
								const vals = deviceState.deviceValues[deviceId!] ??= {};
								for (const item of response.items) {
									if (item.key && item.value !== undefined) {
										const decoded = decodeParamValue({
											key: item.key,
											value: item.value,
											type: item.type ?? 'String'
										});
										vals[item.key] = decoded;
										freshValues[item.key] = decoded;
									}
								}
							}
						} catch {}
					})
				);

				// Fill defaults for keys the device didn't return
				const vals = deviceState.deviceValues[deviceId!] ??= {};
				const allSchemaItems = [
					...schema.panels.flatMap((p: Panel) => [...(p.items ?? []), ...(p.sub_panels ?? []).flatMap((sp: any) => sp.items), ...(p.sections ?? []).flatMap((s: any) => [...(s.items ?? []), ...(s.sub_panels ?? []).flatMap((sp: any) => sp.items)])]),
					...vehicleItems
				];
				for (const item of allSchemaItems) {
					if (vals[item.key] === undefined) {
						if (item.widget === 'toggle') vals[item.key] = false;
						else if (item.widget === 'option' || item.widget === 'multiple_button') vals[item.key] = item.options?.[0]?.value ?? '';
						else vals[item.key] = '';
					}
				}

				// Global drift detection: only for keys in settings_ui.json (user-facing settings)
				// Build key → panel lookup first, then filter freshValues to schema keys only
				if (Object.keys(prefetchCachedSnapshot).length > 0 && Object.keys(freshValues).length > 0) {
					const keyToPanel: Record<string, { id: string; label: string }> = {};
					for (const panel of schema.panels) {
						const tag = { id: panel.id, label: panel.label };
						for (const item of panel.items ?? []) { keyToPanel[item.key] = tag; for (const sub of item.sub_items ?? []) keyToPanel[sub.key] = tag; }
						for (const sp of panel.sub_panels ?? []) { for (const item of sp.items) { keyToPanel[item.key] = tag; for (const sub of item.sub_items ?? []) keyToPanel[sub.key] = tag; } }
						for (const section of panel.sections ?? []) {
							for (const item of section.items) { keyToPanel[item.key] = tag; for (const sub of item.sub_items ?? []) keyToPanel[sub.key] = tag; }
							for (const sp of section.sub_panels ?? []) { for (const item of sp.items) { keyToPanel[item.key] = tag; for (const sub of item.sub_items ?? []) keyToPanel[sub.key] = tag; } }
						}
					}
					if (brand) {
						const vehicleTag = { id: 'vehicle', label: 'Vehicle' };
						for (const item of vehicleItems) { keyToPanel[item.key] = vehicleTag; for (const sub of item.sub_items ?? []) keyToPanel[sub.key] = vehicleTag; }
					}

					// Only detect drift for schema keys — exclude internal params like CarFingerprint, GitCommit
					const schemaFreshValues: Record<string, unknown> = {};
					for (const key of Object.keys(freshValues)) {
						if (key in keyToPanel) schemaFreshValues[key] = freshValues[key];
					}

					const allDrifts = detectDrift(prefetchCachedSnapshot, schemaFreshValues);
					const pending = pendingChanges.getAll(deviceId!);
					const meaningful = filterMeaningfulDrift(allDrifts, pending);

					for (const d of meaningful) {
						const panel = keyToPanel[d.key];
						if (panel) { d.panelId = panel.id; d.panelLabel = panel.label; }
					}
					driftStore.mergeDrifts(deviceId!, meaningful);

					// Resolve keys that were fetched but are no longer drifted
					const driftedKeys = new Set(meaningful.map((d) => d.key));
					const resolvedKeys = Object.keys(freshValues).filter((k) => !driftedKeys.has(k));
					if (resolvedKeys.length > 0) driftStore.resolveKeys(deviceId!, resolvedKeys);
				}

				prefetchDone[deviceId!] = true;
				deviceState.valuesStale[deviceId!] = false;
				// Settings fetch succeeded — device is reachable.
				// Use confirmReachable to update status + reset poll timer atomically.
				statusPolling.confirmReachable(deviceId!);
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
		// Reset verification so the sync indicator shows "Refreshing..." during retry
		deviceState.valuesVerifiedThisSession[deviceId] = false;
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
			{isError ? 'border-orange-500/20 bg-orange-50 dark:bg-orange-500/5' : 'border-amber-500/20 bg-amber-50 dark:bg-yellow-500/5'}">
			{#if isError}
				<AlertTriangle size={16} class="shrink-0 text-orange-600 dark:text-orange-400" />
				<div class="flex-1">
					<p class="text-sm text-orange-800 dark:text-orange-200/80">
						<span class="font-medium">Connection error</span> — Unable to reach device. Settings may be outdated.
					</p>
					{#if lastRetryAt}
						<p class="mt-0.5 text-[0.6875rem] text-orange-600/60 dark:text-orange-300/50">Checked {formatRelativeTime(lastRetryAt)}</p>
					{/if}
				</div>
			{:else}
				<WifiOff size={16} class="shrink-0 text-amber-600 dark:text-yellow-500" />
				<div class="flex-1">
					<p class="text-sm text-amber-800 dark:text-yellow-200/80">
						{#if retryFailed}
							<span class="font-medium">Still offline</span> — Device not reachable. Showing cached settings.
						{:else}
							<span class="font-medium">Offline</span> — Showing cached settings. Changes disabled until device is online.
						{/if}
					</p>
					{#if lastRetryAt}
						<p class="mt-0.5 text-[0.6875rem] text-amber-600/60 dark:text-yellow-300/50">Checked {formatRelativeTime(lastRetryAt)}</p>
					{/if}
				</div>
			{/if}
			<button
				class="btn btn-ghost btn-xs shrink-0 {isError ? 'text-orange-700 dark:text-orange-400' : 'text-yellow-700 dark:text-yellow-400'}"
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
