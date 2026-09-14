<script lang="ts">
	import { deviceState } from '$lib/stores/device.svelte';
	import { schemaState } from '$lib/stores/schema.svelte';
	import { logtoClient } from '$lib/logto/auth.svelte';
	import { fetchSettingsAsync } from '$lib/api/device';
	import { decodeParamValue } from '$lib/utils/device';
	import { detectDrift, filterMeaningfulDrift } from '$lib/utils/drift';
	import { driftStore } from '$lib/stores/driftStore.svelte';
	import { refreshBanner, type RefreshEntry } from '$lib/stores/refreshBanner.svelte';
	import { findSchemaItem, formatSchemaValue } from '$lib/utils/schemaLookup';
	import { pendingChanges } from '$lib/stores/pendingChanges.svelte';
	import { batchPush } from '$lib/stores/batchPush.svelte';
	import type { Panel } from '$lib/types/schema';
	import { statusPolling } from '$lib/stores/statusPolling.svelte';
	import { untrack } from 'svelte';

	let { children } = $props();

	let deviceId = $derived(deviceState.selectedDeviceId);
	let deviceStatus = $derived(deviceId ? deviceState.onlineStatuses[deviceId] : undefined);
	let isOnline = $derived(deviceStatus === 'online');

	// Background prefetch: when schema is loaded and device is online,
	// fetch ALL panel keys + vehicle_settings keys in the background so every
	// dashboard page (settings, models, etc.) loads instantly from cache on
	// subsequent visits or F5 refresh, and cross-category gating values like
	// ShowAdvancedControls are available regardless of which page the user
	// lands on first.
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
				const t: string = token;

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
							const response = await fetchSettingsAsync(did, chunk, t);
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

						// Surface as persistent banner entries (survives reloads this
						// session) so driving-companion users can review changes after
						// parking. Dropped the ephemeral toast — it was easy to miss.
						const now = Date.now();
						const entries: RefreshEntry[] = [];
						for (const d of passiveDrifts) {
							const resolved = findSchemaItem(schema, vehicleItems, d.key);
							if (!resolved) continue;
							const hadOld = d.cachedValue !== undefined && d.cachedValue !== null;
							entries.push({
								key: d.key,
								label: resolved.path.label,
								panelId: resolved.path.panelId,
								panelLabel: resolved.path.panelLabel,
								subPanelId: resolved.path.subPanelId,
								oldDisplay: hadOld ? formatSchemaValue(resolved.item, d.cachedValue) : '',
								newDisplay: formatSchemaValue(resolved.item, d.freshValue),
								hadOld,
								at: now
							});
						}
						if (entries.length > 0) refreshBanner.add(did, entries);
					}

					// Sweep stale drift entries (anything no longer drifting) so the
					// banner doesn't carry forward stale state from prior fetches.
					const driftedKeys = new Set(meaningful.map((d) => d.key));
					const resolvedKeys = Object.keys(freshValues).filter((k) => !driftedKeys.has(k));
					if (resolvedKeys.length > 0) driftStore.resolveKeys(did, resolvedKeys);
				}

				{
					const currentBaseline = driftStore.getBaseline(did);
					const additions: Record<string, unknown> = {};
					for (const [key, val] of Object.entries(freshValues)) {
						if (!Object.prototype.hasOwnProperty.call(currentBaseline, key)) {
							additions[key] = val;
						}
					}
					if (Object.keys(additions).length > 0) {
						driftStore.updateBaseline(did, { ...currentBaseline, ...additions });
					}
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
</script>

{@render children()}
