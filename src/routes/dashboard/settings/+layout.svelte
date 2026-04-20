<script lang="ts">
	import { deviceState } from '$lib/stores/device.svelte';
	import { schemaState } from '$lib/stores/schema.svelte';
	import { preferences } from '$lib/stores/preferences.svelte';
	import { logtoClient } from '$lib/logto/auth.svelte';
	import { checkDeviceStatus } from '$lib/api/device';
	import {
		loadCachedValues,
		saveCachedValues,
		getLastKnownCommit,
		setLastKnownCommit,
		updateCachedValue
	} from '$lib/stores/valuesCache';
	import { detectDrift, filterMeaningfulDrift } from '$lib/utils/drift';
	import { driftStore } from '$lib/stores/driftStore.svelte';
	import { fetchSettingsAsync, setDeviceParams } from '$lib/api/device';
	import { decodeParamValue, encodeParamValue } from '$lib/utils/device';
	import { pendingChanges } from '$lib/stores/pendingChanges.svelte';
	import { batchPush } from '$lib/stores/batchPush.svelte';
	import type { Panel } from '$lib/types/schema';
	import type { PendingChange } from '$lib/stores/pendingChanges.svelte';
	import { collectOffroadOnlyKeys } from '$lib/rules/evaluator';
	import { WifiOff, AlertTriangle, Shield, Info, Wifi, RefreshCw } from 'lucide-svelte';
	import { formatRelativeTime } from '$lib/utils/time';
	import { statusPolling } from '$lib/stores/statusPolling.svelte';
	import { untrack } from 'svelte';
	import { toast } from 'svelte-sonner';

	let { children, data } = $props();

	let retrying = $state(false);
	let lastRetryAt = $state<number | null>(null);
	let retryFailed = $state(false);
	let wasOffline = $state(false);
	let reconnectFlushTimer: ReturnType<typeof setTimeout> | undefined = undefined;
	const RECONNECT_DEBOUNCE_MS = 4_000;

	let deviceId = $derived(deviceState.selectedDeviceId);
	let deviceStatus = $derived(deviceId ? deviceState.onlineStatuses[deviceId] : undefined);
	let isOnline = $derived(deviceStatus === 'online');
	let isDeviceUnavailable = $derived(deviceId ? !isOnline : false);

	let isLoading = $derived(deviceStatus === 'loading' || deviceStatus === undefined);
	let isError = $derived(deviceStatus === 'error');

	// Track when device transitions from offline → online.
	// Debounced flush: give the user the full RECONNECT_DEBOUNCE_MS window to
	// react/edit before pending changes start syncing. No "Push now" button —
	// pace is intentional to discourage rushing.
	function scheduleReconnectFlush(did: string) {
		if (reconnectFlushTimer !== undefined) clearTimeout(reconnectFlushTimer);
		const count = pendingChanges.pendingCount(did);
		if (count === 0) return;
		toast.success(
			`Device reconnected. ${count} pending change${count === 1 ? '' : 's'} will sync shortly.`
		);
		reconnectFlushTimer = setTimeout(() => {
			reconnectFlushTimer = undefined;
			if (!deviceState.onlineStatuses[did] || deviceState.onlineStatuses[did] !== 'online') return;
			flushPendingChanges(did);
		}, RECONNECT_DEBOUNCE_MS);
	}

	$effect(() => {
		if (isOnline && wasOffline) {
			wasOffline = false;
			if (deviceId) {
				if (pendingChanges.hasPending(deviceId)) {
					scheduleReconnectFlush(deviceId);
				} else {
					toast.success('Device reconnected');
				}
			}
		}
		if (isDeviceUnavailable && !isLoading) {
			wasOffline = true;
			if (reconnectFlushTimer !== undefined) {
				clearTimeout(reconnectFlushTimer);
				reconnectFlushTimer = undefined;
			}
		}
	});

	// Also flush on initial load if device is online and has pending changes
	// (no toast — this is the silent first-load path, not a reconnect event).
	$effect(() => {
		if (deviceId && isOnline && pendingChanges.hasPending(deviceId) && !wasOffline) {
			flushPendingChanges(deviceId);
		}
	});

	// Auto-flush blocked changes when device transitions to offroad
	let wasOnroad = false;
	$effect(() => {
		const isOffroad = deviceState.offroadStatuses[deviceId ?? '']?.isOffroad ?? true;
		if (!isOffroad) {
			wasOnroad = true;
		} else if (wasOnroad && isOffroad && deviceId && isOnline) {
			wasOnroad = false;
			// Device went offroad — unblock and re-flush
			pendingChanges.unblockAll(deviceId);
			if (pendingChanges.hasPending(deviceId)) {
				flushPendingChanges(deviceId);
			}
		}
	});

	/** Flush all pending changes to the device via the settings API.
	 *  Offroad-only items are blocked (not pushed) when the device is onroad. */
	async function flushPendingChanges(did: string) {
		if (!logtoClient || pendingChanges.isFlushing(did)) return;

		const token = await logtoClient.getIdToken();
		if (!token) return;

		const pending = pendingChanges.getByStatus(did, 'pending');
		if (pending.length === 0) return;

		// Check offroad state and collect offroad-only keys
		const isOnroad = !(deviceState.offroadStatuses[did]?.isOffroad ?? true);
		const schema = schemaState.schemas[did];
		const offroadKeys = schema ? collectOffroadOnlyKeys(schema) : new Set<string>();

		// Block offroad-only items when device is onroad
		let blockedCount = 0;
		const pushable: PendingChange[] = [];
		for (const change of pending) {
			if (isOnroad && offroadKeys.has(change.key)) {
				pendingChanges.markBlocked(did, change.key);
				blockedCount++;
			} else {
				pushable.push(change);
			}
		}

		if (blockedCount > 0) {
			toast.warning(
				`${blockedCount} change${blockedCount === 1 ? '' : 's'} blocked — vehicle is driving. Will sync when parked.`
			);
		}

		if (pushable.length === 0) {
			return;
		}

		pendingChanges.setFlushing(did, true);

		// Mark pushable as pushing
		for (const change of pushable) pendingChanges.markPushing(did, change.key);

		// Encode all changes and batch into a single API call
		const payload: { key: string; value: string }[] = [];
		const encoded: PendingChange[] = [];
		for (const change of pushable) {
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
				await setDeviceParams(did, payload, token, 20_000);

				// Success: mark all confirmed, update cache
				const gitCommit = (deviceState.deviceValues[did]?.['GitCommit'] as string) || '';
				for (const change of encoded) {
					pendingChanges.markConfirmed(did, change.key);
					if (gitCommit) updateCachedValue(did, gitCommit, change.key, change.desiredValue);
					const baseline = driftStore.getBaseline(did);
					if (Object.keys(baseline).length > 0) {
						driftStore.updateBaseline(did, { ...baseline, [change.key]: change.desiredValue });
					}
					driftStore.resolveKeys(did, [change.key]);
				}
			} catch (e) {
				const eName = (e as { name?: string })?.name;
				// Definite failure: TypeError = no network (request never left browser)
				if (eName === 'TypeError') {
					for (const change of encoded) {
						pendingChanges.markFailed(did, change.key, 'No network connection.');
					}
				} else {
					// Abort, timeout, 5xx — request reached server, device likely
					// processed the write. Treat optimistically.
					for (const change of encoded) {
						pendingChanges.markConfirmed(did, change.key);
						const baseline = driftStore.getBaseline(did);
						if (Object.keys(baseline).length > 0) {
							driftStore.updateBaseline(did, { ...baseline, [change.key]: change.desiredValue });
						}
						driftStore.resolveKeys(did, [change.key]);
					}
				}
			}
		}

		pendingChanges.setFlushing(did, false);

		// Failed changes get a toast
		const failedCount = pendingChanges.failedCount(did);
		if (failedCount > 0) {
			toast.error(`${failedCount} change${failedCount === 1 ? '' : 's'} failed to sync`);
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

	// Capture drift baseline into the persistent driftStore (survives layout unmount).
	function captureDriftBaseline(did: string) {
		if (Object.keys(driftStore.getBaseline(did)).length > 0) return;
		const commit = getLastKnownCommit(did) || '';
		if (!commit) return;
		const cached = loadCachedValues(did, commit);
		if (cached && Object.keys(cached).length > 0) {
			driftStore.captureBaseline(did, cached);
		}
	}
	if (deviceState.selectedDeviceId) {
		captureDriftBaseline(deviceState.selectedDeviceId);
	}

	// Also re-hydrate reactively when device changes (for device switching)
	$effect(() => {
		if (deviceId) {
			captureDriftBaseline(deviceId);
			hydrateCacheSync(deviceId);
		}
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

	// Re-trigger global prefetch when valuesStale is set (manual refresh, version change)
	$effect(() => {
		if (deviceId && deviceState.valuesStale[deviceId]) {
			prefetchDone[deviceId] = false;
		}
	});

	// Reactive trigger: only re-run when deviceId changes, prefetchDone is cleared,
	// or schema availability changes. All other reads are untracked to prevent
	// re-triggering on capability refreshes or online status flickers.
	let prefetchTrigger = $derived(
		deviceId && !prefetchDone[deviceId ?? ''] && schemaState.hasSchema(deviceId ?? '')
			? deviceId
			: null
	);
	$effect(() => {
		const did = prefetchTrigger;
		if (!did) return;
		// Mark as done immediately to prevent re-entry while the async fetch is in-flight.
		// On failure, prefetchDone is NOT reverted — the versionPoller or manual refresh
		// will clear it via valuesStale when the device actually has new data.
		prefetchDone[did] = true;
		// All subsequent reads are untracked — we only care about the trigger above
		const online = untrack(() => isOnline);
		const client = untrack(() => logtoClient);
		if (!online || !client) return;
		const schema = untrack(() => schemaState.schemas[did]);
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
		const caps = schemaState.capabilities[did];
		const brand = caps?.brand ?? '';
		const brandData = brand && schema.vehicle_settings ? schema.vehicle_settings[brand] : null;
		const vehicleItems = brandData?.items ?? [];
		for (const item of vehicleItems) addItem(item);

		// Also prefetch vehicle detection params (used by VehicleSelector)
		allKeys.push('CarPlatformBundle', 'CarFingerprint', 'CarParamsPersistent');

		const existing = deviceState.deviceValues[did] ?? {};
		const uniqueKeys = [...new Set(allKeys)];

		// Use the persistent drift baseline (survives layout unmount).
		const prefetchCachedSnapshot = driftStore.getBaseline(did);

		// Background fetch — always fetch all keys for global drift detection.
		// Flag updates live in finally{} so the spinner stops even when the
		// fetch returns early (no token), throws inside drift detection, or the
		// abort path skips the inner clears.
		(async () => {
			let token: string | null | undefined;
			try {
				token = await client!.getIdToken();
				if (!token) return;

				// Chunk into batches of 150 (URL ~5.4KB, under 8KB limit). Each
				// chunk = 1 init + N polls + 1 CORS preflight, so bigger = fewer
				// round-trips.
				const chunks: string[][] = [];
				for (let i = 0; i < uniqueKeys.length; i += 150) {
					chunks.push(uniqueKeys.slice(i, i + 150));
				}

				const freshValues: Record<string, unknown> = {};
				await Promise.all(
					chunks.map(async (chunk) => {
						try {
							const response = await fetchSettingsAsync(did, chunk, token);
							if (response.items) {
								const vals = (deviceState.deviceValues[did] ??= {});
								for (const item of response.items) {
									if (item.key && item.value !== undefined) {
										const decoded = decodeParamValue({
											key: item.key,
											value: item.value,
											type: item.type ?? 'String'
										});
										// Preserve user's optimistic value for keys with in-flight changes
										const pcEntry = pendingChanges.getForKey(did, item.key);
										const pcInFlight =
											pcEntry &&
											(pcEntry.status === 'pending' ||
												pcEntry.status === 'pushing' ||
												pcEntry.status === 'blocked_onroad');
										if (!batchPush.hasPendingKey(did, item.key) && !pcInFlight) {
											vals[item.key] = decoded;
										}
										freshValues[item.key] = decoded;
									}
								}
							}
						} catch {}
					})
				);

				// Fill defaults for keys the device didn't return
				const vals = (deviceState.deviceValues[did] ??= {});
				const allSchemaItems = [
					...schema.panels.flatMap((p: Panel) => [
						...(p.items ?? []),
						...(p.sub_panels ?? []).flatMap((sp: any) => sp.items),
						...(p.sections ?? []).flatMap((s: any) => [
							...(s.items ?? []),
							...(s.sub_panels ?? []).flatMap((sp: any) => sp.items)
						])
					]),
					...vehicleItems
				];
				for (const item of allSchemaItems) {
					if (vals[item.key] === undefined) {
						if (item.widget === 'toggle') vals[item.key] = false;
						else if (item.widget === 'option' || item.widget === 'multiple_button')
							vals[item.key] = item.options?.[0]?.value ?? '';
						else vals[item.key] = '';
					}
				}

				// Global drift detection: only for keys in settings_ui.json (user-facing settings)
				// Build key → metadata lookup for drift enrichment
				if (Object.keys(prefetchCachedSnapshot).length > 0 && Object.keys(freshValues).length > 0) {
					interface KeyMeta {
						panelId: string;
						panelLabel: string;
						sectionLabel?: string;
						subPanelLabel?: string;
						itemTitle?: string;
					}
					const keyMeta: Record<string, KeyMeta> = {};
					function tagItem(item: any, base: Omit<KeyMeta, 'itemTitle'>) {
						keyMeta[item.key] = { ...base, itemTitle: item.title || item.key };
						for (const sub of item.sub_items ?? []) {
							keyMeta[sub.key] = { ...base, itemTitle: sub.title || sub.key };
						}
					}
					for (const panel of schema.panels) {
						const base = { panelId: panel.id, panelLabel: panel.label };
						for (const item of panel.items ?? []) tagItem(item, base);
						for (const sp of panel.sub_panels ?? []) {
							for (const item of sp.items) tagItem(item, { ...base, subPanelLabel: sp.label });
						}
						for (const section of panel.sections ?? []) {
							const sBase = { ...base, sectionLabel: section.title || undefined };
							for (const item of section.items) tagItem(item, sBase);
							for (const sp of section.sub_panels ?? []) {
								for (const item of sp.items) tagItem(item, { ...sBase, subPanelLabel: sp.label });
							}
						}
					}
					if (brand) {
						const vBase = { panelId: 'vehicle', panelLabel: 'Vehicle' };
						for (const item of vehicleItems) tagItem(item, vBase);
					}

					const schemaFreshValues: Record<string, unknown> = {};
					for (const key of Object.keys(freshValues)) {
						if (key in keyMeta) schemaFreshValues[key] = freshValues[key];
					}

					const allDrifts = detectDrift(prefetchCachedSnapshot, schemaFreshValues);
					const pending = pendingChanges.getAll(did);
					const meaningful = filterMeaningfulDrift(allDrifts, pending);

					// Drift handling (device-as-server-of-truth model):
					//
					// Drifts on keys WITH a pending edit → conflict territory.
					//   batchPush conflict UI handles them; we don't populate the
					//   drift banner section to avoid double-surfacing.
					// Drifts on keys WITHOUT a pending edit → device wins silently.
					//   Update baseline + cached values + emit a brief informational
					//   toast so the user knows fresh values arrived. No sticky banner.
					const pendingKeys = new Set(pending.map((p) => p.key));
					const passiveDrifts = meaningful.filter((d) => !pendingKeys.has(d.key));

					if (passiveDrifts.length > 0) {
						const newBaseline: Record<string, unknown> = {
							...driftStore.getBaseline(did)
						};
						for (const d of passiveDrifts) newBaseline[d.key] = d.freshValue;
						driftStore.updateBaseline(did, newBaseline);

						const n = passiveDrifts.length;
						toast(`${n} setting${n === 1 ? '' : 's'} refreshed from device`, {
							duration: 4_000
						});
					}

					// Sweep stale drift entries (anything no longer drifting) so the
					// banner doesn't carry forward stale state from prior fetches.
					const driftedKeys = new Set(meaningful.map((d) => d.key));
					const resolvedKeys = Object.keys(freshValues).filter((k) => !driftedKeys.has(k));
					if (resolvedKeys.length > 0) driftStore.resolveKeys(did, resolvedKeys);
				}

			} catch {
				// Errors are non-fatal — flags still cleared in finally so the UI
				// recovers from spinner-stuck state even on partial failure.
			} finally {
				prefetchDone[did] = true;
				deviceState.valuesStale[did] = false;
				deviceState.valuesVerifiedThisSession[did] = true;
				// Mark the device reachable only when the fetch actually got a token.
				// confirmReachable resets onlineStatuses to 'online' which would mask
				// a real auth failure if we ran it on the early-return-no-token path.
				if (token) statusPolling.confirmReachable(did);
			}
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
		deviceState.valuesVerifiedThisSession[deviceId] = false;
		prefetchDone[deviceId] = false;
		try {
			const token = await logtoClient.getIdToken();
			if (token) await checkDeviceStatus(deviceId, token, true);
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
					class="btn text-[var(--sl-text-2)] btn-ghost btn-xs"
					onclick={() => dismissHelp(false)}
				>
					Dismiss
				</button>
			</div>
			<div class="space-y-2 px-4 py-3">
				<div class="flex gap-2.5">
					<Shield class="mt-0.5 shrink-0 text-primary" size={16} />
					<p class="text-[0.8125rem] font-[450] text-[var(--sl-text-2)]">
						We do <strong class="text-[var(--sl-text-1)]">not</strong> store your device settings on
						our servers. A direct device connection is required.
					</p>
				</div>
				<div class="flex gap-2.5">
					<Info class="mt-0.5 shrink-0 text-primary" size={16} />
					<p class="text-[0.8125rem] font-[450] text-[var(--sl-text-2)]">
						Backups are encrypted with your device's private key. Only your device can decrypt them.
					</p>
				</div>
			</div>
			<div class="flex justify-end border-t border-[var(--sl-border)] px-4 py-2.5">
				<button
					type="button"
					class="btn text-[var(--sl-text-2)] btn-ghost btn-xs"
					onclick={() => dismissHelp(true)}
				>
					Don't show again
				</button>
			</div>
		</div>
	</div>
{/if}

<!-- Offline/error banner — inline above content, never replaces it -->
{#if deviceId && isDeviceUnavailable && !isLoading}
	<div class="mx-auto mb-4 w-full max-w-2xl xl:max-w-3xl">
		<div
			class="flex items-center gap-2.5 rounded-lg border px-4 py-2.5
			{isError
				? 'border-orange-500/20 bg-orange-50 dark:bg-orange-500/5'
				: 'border-amber-500/20 bg-amber-50 dark:bg-yellow-500/5'}"
		>
			{#if isError}
				<AlertTriangle size={16} class="shrink-0 text-orange-600 dark:text-orange-400" />
				<div class="flex-1">
					<p class="text-sm text-orange-800 dark:text-orange-200/80">
						<span class="font-medium">Connection error</span> — Unable to reach device. Settings may
						be outdated.
					</p>
					{#if lastRetryAt}
						<p class="mt-0.5 text-[0.6875rem] text-orange-600/60 dark:text-orange-300/50">
							Checked {formatRelativeTime(lastRetryAt)}
						</p>
					{/if}
				</div>
			{:else}
				<WifiOff size={16} class="shrink-0 text-amber-600 dark:text-yellow-500" />
				<div class="flex-1">
					<p class="text-sm text-amber-800 dark:text-yellow-200/80">
						{#if retryFailed}
							<span class="font-medium">Still offline</span> — Device not reachable. Showing cached settings.
						{:else}
							<span class="font-medium">Offline</span> — Showing cached settings. Changes disabled until
							device is online.
						{/if}
					</p>
					{#if lastRetryAt}
						<p class="mt-0.5 text-[0.6875rem] text-amber-600/60 dark:text-yellow-300/50">
							Checked {formatRelativeTime(lastRetryAt)}
						</p>
					{/if}
				</div>
			{/if}
			<button
				class="btn shrink-0 btn-ghost btn-xs {isError
					? 'text-orange-700 dark:text-orange-400'
					: 'text-yellow-700 dark:text-yellow-400'}"
				disabled={retrying}
				onclick={handleRetry}
			>
				{#if retrying}
					<span class="loading loading-xs loading-spinner"></span>
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

<!-- Always render children — never gate on device status.
     SchemaItemRenderer's pushValue() has its own offline guard.
     Cached values show instantly; fresh values stream in via background fetch. -->
{@render children()}
