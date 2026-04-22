<script lang="ts">
	import { page } from '$app/state';
	import { goto, beforeNavigate } from '$app/navigation';
	import { deviceState } from '$lib/stores/device.svelte';
	import { schemaState } from '$lib/stores/schema.svelte';
	import { searchState } from '$lib/stores/search.svelte';
	import {
		SETTINGS_DEFINITIONS,
		type SettingCategory,
		type RenderableSetting
	} from '$lib/types/settings';
	import type { Panel, SubPanel } from '$lib/types/schema';
	import { fetchSettingsAsync, checkDeviceStatus } from '$lib/api/device';
	import { logtoClient } from '$lib/logto/auth.svelte';
	import { decodeParamValue } from '$lib/utils/device';
	import { getAllSettings } from '$lib/utils/settings';
	import { searchSettings } from '$lib/utils/search';
	import { pendingChanges } from '$lib/stores/pendingChanges.svelte';
	import { statusPolling } from '$lib/stores/statusPolling.svelte';
	import { settingToSchemaItem } from '$lib/utils/settingAdapter';

	import { untrack } from 'svelte';
	import { fly, fade } from 'svelte/transition';
	import { createSyncStatus } from '$lib/utils/syncStatus.svelte';
	import { batchPush } from '$lib/stores/batchPush.svelte';
	import SyncStatusIndicator from '$lib/components/SyncStatusIndicator.svelte';
	import SettingsActionBar from '$lib/components/SettingsActionBar.svelte';
	import PushSettingsModal from '$lib/components/PushSettingsModal.svelte';
	import SettingCard from '$lib/components/SettingCard.svelte';
	import SchemaPanel from '$lib/components/schema/SchemaPanel.svelte';
	import SchemaItemRenderer from '$lib/components/schema/SchemaItemRenderer.svelte';
	import AlwaysOffroadPrompt from '$lib/components/AlwaysOffroadPrompt.svelte';
	import BackLink from '$lib/components/BackLink.svelte';
	import { toast } from 'svelte-sonner';

	let { data } = $props();

	let category = $derived(page.params.category as SettingCategory);
	let deviceId = $derived(deviceState.selectedDeviceId);
	let settings = $derived(deviceId ? deviceState.deviceSettings[deviceId] : undefined);
	let deviceValues = $derived(deviceId ? deviceState.deviceValues[deviceId] : undefined);
	let hasChanges = $derived(deviceId ? deviceState.hasChanges(deviceId) : false);

	let useSchema = $derived(deviceId ? schemaState.hasSchema(deviceId) : false);
	let schemaLoading = $derived(
		deviceId ? !!schemaState.loading[deviceId] && !schemaState.schemaUnavailable[deviceId] : false
	);

	// Find the matching schema panel for this category
	let schemaPanel: Panel | undefined = $derived.by(() => {
		if (!deviceId || !useSchema) return undefined;
		const schema = schemaState.schemas[deviceId];
		if (!schema) return undefined;
		return schema.panels.find((p) => p.id === category);
	});

	// Load schema when device is selected
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
			// Get GitCommit for cache key
			const gitCommit = deviceState.deviceValues[deviceId]?.['GitCommit'] as string | undefined;
			await schemaState.loadSchema(deviceId, token, gitCommit);
		} catch (e) {
			console.error('Failed to load schema:', e);
		}
	}

	// Sub-panel state driven by URL query param for browser back support
	let subPanelDirection: 'forward' | 'back' = $state('forward');

	// Collect all sub-panels from the schema panel (flat + sections)
	let allSubPanels = $derived.by(() => {
		if (!schemaPanel) return [];
		const sps: SubPanel[] = [...(schemaPanel.sub_panels ?? [])];
		for (const section of schemaPanel.sections ?? []) {
			for (const sp of section.sub_panels ?? []) {
				sps.push(sp);
			}
		}
		return sps;
	});

	// Derive active sub-panel from URL ?panel= param
	let activeSubPanel: SubPanel | null = $derived.by(() => {
		const panelId = page.url.searchParams.get('panel');
		if (!panelId || allSubPanels.length === 0) return null;
		return allSubPanels.find((sp) => sp.id === panelId) ?? null;
	});

	// Detect browser back/forward (popstate) to set correct animation direction
	// beforeNavigate fires BEFORE SvelteKit processes the navigation,
	// so subPanelDirection is set before the template re-renders.
	beforeNavigate(({ type, to }) => {
		if (type === 'popstate') {
			const toPanel = to?.url.searchParams.get('panel');
			const fromPanel = page.url.searchParams.get('panel');
			if (fromPanel && !toPanel) {
				// Going back from sub-panel to parent
				subPanelDirection = 'back';
			} else if (!fromPanel && toPanel) {
				// Going forward into a sub-panel (browser forward button)
				subPanelDirection = 'forward';
			}
		}
	});

	function openSubPanel(subPanel: SubPanel) {
		subPanelDirection = 'forward';
		const url = new URL(page.url);
		url.searchParams.set('panel', subPanel.id);
		goto(url.toString(), { keepFocus: true, noScroll: true });
	}

	function closeSubPanel() {
		subPanelDirection = 'back';
		const url = new URL(page.url);
		url.searchParams.delete('panel');
		goto(url.toString(), { keepFocus: true, noScroll: true });
	}

	let currentDeviceAlias = $derived(
		deviceId ? (deviceState.aliases[deviceId] ?? deviceId) : undefined
	);

	let categorySettings = $derived.by(() => {
		const all = getAllSettings(settings).filter((s) => s.category === category);
		if (!searchState.query.trim()) return all;
		const results = searchSettings(searchState.query, all, deviceValues);
		return results.map((r) => r.setting);
	});

	let writableSettings = $derived.by(() => {
		let currentSection: RenderableSetting | null = null;
		let result: RenderableSetting[] = [];
		for (const s of categorySettings) {
			if (s.isSection) {
				currentSection = s;
			} else if (!s.readonly) {
				if (currentSection) {
					result.push(currentSection);
					currentSection = null;
				}
				result.push(s);
			}
		}
		return result;
	});

	let readonlySettings = $derived.by(() => {
		let currentSection: RenderableSetting | null = null;
		let result: RenderableSetting[] = [];
		for (const s of categorySettings) {
			if (s.isSection) {
				currentSection = s;
			} else if (s.readonly) {
				if (currentSection) {
					result.push(currentSection);
					currentSection = null;
				}
				result.push(s);
			}
		}
		return result;
	});

	// Grouped settings for unified rendering (replaces 3-column grid)
	let writableGroups = $derived(groupSettingsBySection(writableSettings));
	let readonlyGroups = $derived(groupSettingsBySection(readonlySettings));

	let loadingValues = $state(false);
	let revalidatingValues = $state(false);
	let valuesFetchFailed = $state(false);

	// Show skeleton placeholders for individual setting widgets whenever values
	// haven't been fetched yet this session — even if our local loadingValues
	// flag hasn't flipped on yet (for example, between schema landing and the
	// fetchSchemaValues effect actually firing). Without this the page would
	// briefly render every toggle in its default-off state, which the user
	// reads as "blank" once the connecting spinner disappears.
	// Skip the skeleton for offline devices — those should render cached
	// values (or empty defaults) without pretending a fetch is in flight.

	// Device-level verification: shared across all settings pages.
	// Once any page successfully fetches values, all pages are instantly "Up to Date".
	// Offline/error devices are considered verified immediately (nothing to fetch).
	let deviceOnlineStatus = $derived(deviceId ? deviceState.onlineStatuses[deviceId] : undefined);
	let isDeviceOfflineOrError = $derived(
		deviceOnlineStatus === 'offline' || deviceOnlineStatus === 'error'
	);
	// Legacy and schema devices both verify only once a values fetch has actually
	// populated deviceValues (valuesVerifiedThisSession). Earlier code marked legacy
	// "verified" as soon as deviceSettings arrived, but that array is just the
	// metadata list — current values still come from a separate fetch. Trusting it
	// caused the legacy effect below to skip fetchCurrentValues on first load,
	// leaving every toggle on its default-off state until the user pressed refresh.
	let deviceVerified = $derived(
		deviceId ? isDeviceOfflineOrError || !!deviceState.valuesVerifiedThisSession[deviceId] : false
	);

	// Skeleton flag for individual setting widgets — covers both the explicit
	// loadingValues window and the gap before the first values fetch fires.
	// See the longer note above the loadingValues declaration for rationale.
	let showValueSkeleton = $derived(loadingValues || (!deviceVerified && !isDeviceOfflineOrError));

	// Legacy devices need V1 /v1/settings/{deviceId} to populate the param
	// list before any cards can render — explicit defs without a per-key
	// `value` get filtered out. Hold the Connecting state while we still
	// expect that response. lastStatusCheck flips once checkDeviceStatus
	// finishes (success OR failure), so this never deadlocks.
	let legacyAwaitingSettings = $derived(
		!!deviceId &&
			!useSchema &&
			!schemaLoading &&
			!settings &&
			!deviceState.lastStatusCheck[deviceId]
	);

	// True when values are actively being fetched or a global refresh is in-flight.
	// valuesStale = layout's global prefetch running (manual refresh / version change).
	// revalidatingValues = this page's own fetch running.
	// !deviceVerified = first visit, no values yet.
	let isStale = $derived(!!(deviceId && deviceState.valuesStale[deviceId]));
	let isDeviceLoading = $derived(deviceOnlineStatus === 'loading');
	let isRevalidating = $derived(
		isDeviceLoading ||
			(!isDeviceOfflineOrError && (revalidatingValues || !deviceVerified || isStale))
	);

	// Overall revalidation succeeded: device is online, verified, no active fetch, not stale.
	let revalidationSucceeded = $derived(
		!isDeviceOfflineOrError &&
			deviceVerified &&
			!revalidatingValues &&
			!valuesFetchFailed &&
			!isStale
	);

	let batchActive = $derived(deviceId ? batchPush.isActive(deviceId) : false);
	const sync = createSyncStatus(
		() => isRevalidating || batchActive,
		() => revalidationSucceeded && !batchActive
	);

	// Reset per-category loading state on category change
	$effect(() => {
		category; // track
		loadingValues = false;
		revalidatingValues = false;
		valuesFetchFailed = false;
	});
	let pushModalOpen = $state(false);

	// Fetch values for schema-driven rendering (cancels on nav away)
	// Tracks: deviceId, category, logtoClient, useSchema, schemaPanel (re-runs when schema loads)
	// Untracked: isDeviceOfflineOrError, deviceVerified (prevents cascade from store writes)
	//
	// Skip the per-page fetch when the layout's global prefetch has already verified
	// all values this session. This eliminates redundant device round-trips on every
	// category navigation (values are already in deviceState.deviceValues from the
	// layout prefetch). Only fetch on first visit or when explicitly stale.
	$effect(() => {
		if (deviceId && logtoClient && useSchema && schemaPanel) {
			const offline = untrack(() => isDeviceOfflineOrError);
			if (offline) return;
			const verified = untrack(() => deviceVerified);
			const stale = untrack(() => isStale);
			if (verified && !stale) return;
			const controller = new AbortController();
			fetchSchemaValues(controller.signal);
			return () => controller.abort('effect cleanup');
		}
	});

	// Fetch values for legacy rendering (cancels on nav away)
	$effect(() => {
		if (deviceId && logtoClient && !useSchema && categorySettings.length > 0) {
			const offline = untrack(() => isDeviceOfflineOrError);
			if (offline) return;
			const verified = untrack(() => deviceVerified);
			const stale = untrack(() => isStale);
			if (verified && !stale) return;
			const controller = new AbortController();
			fetchCurrentValues(controller.signal);
			return () => controller.abort('effect cleanup');
		}
	});

	$effect(() => {
		if (page.url.searchParams.get('openPush') === 'true') {
			pushModalOpen = true;
			const newUrl = new URL(page.url);
			newUrl.searchParams.delete('openPush');
			goto(newUrl.toString(), { replaceState: true, keepFocus: true, noScroll: true });
		}
	});

	// Deep-link highlight: SettingsRefreshBanner jump-links append `?highlight=<key>`
	// so we can scroll the targeted setting into view and pulse it once the page
	// has settled. Wait for the device to be verified + any sub-panel fly
	// transition to finish (~400ms budget covers the 200ms in + 120ms delay).
	// aria-live announcement also lands here so screen-reader users get the
	// same "navigated to X" feedback sighted users get from the pulse.
	let highlightAnnouncement = $state('');
	$effect(() => {
		const key = page.url.searchParams.get('highlight');
		if (!key) return;
		if (!deviceVerified) return;
		const subPanelParam = page.url.searchParams.get('panel');
		const subPanelReady = subPanelParam ? activeSubPanel?.id === subPanelParam : !activeSubPanel;
		if (!subPanelReady) return;

		const timer = window.setTimeout(() => {
			const el = document.getElementById(key);
			if (el) {
				const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
				el.scrollIntoView({
					block: 'nearest',
					behavior: prefersReducedMotion ? 'auto' : 'smooth'
				});
				el.setAttribute('data-settings-highlight', 'true');
				const readableLabel = el.querySelector('h3, h4, p, span')?.textContent?.trim() || key;
				highlightAnnouncement = `Navigated to ${readableLabel}, refreshed from device.`;
				window.setTimeout(() => {
					el.removeAttribute('data-settings-highlight');
				}, 2500);
			}
			const cleanUrl = new URL(page.url);
			cleanUrl.searchParams.delete('highlight');
			goto(cleanUrl.toString(), { replaceState: true, keepFocus: true, noScroll: true });
		}, 400);
		return () => window.clearTimeout(timer);
	});

	function chunkArray<T>(array: T[], size: number): T[][] {
		const result = [];
		for (let i = 0; i < array.length; i += size) {
			result.push(array.slice(i, i + size));
		}
		return result;
	}

	/** Collect all param keys from a schema panel (items + sub_items + sub_panels + sections) */
	function collectPanelKeys(panel: Panel): string[] {
		const keys: string[] = [];
		function addItem(item: { key: string; sub_items?: { key: string }[] }) {
			keys.push(item.key);
			for (const sub of item.sub_items ?? []) {
				keys.push(sub.key);
			}
		}
		for (const item of panel.items ?? []) addItem(item);
		for (const sp of panel.sub_panels ?? []) {
			for (const item of sp.items) addItem(item);
		}
		// Walk sections (V2 path) for robustness
		for (const section of panel.sections ?? []) {
			for (const item of section.items) addItem(item);
			for (const sp of section.sub_panels ?? []) {
				for (const item of sp.items) addItem(item);
			}
		}
		return [...new Set(keys)];
	}

	async function fetchSchemaValues(signal?: AbortSignal) {
		if (!deviceId || !logtoClient || !schemaPanel) return;
		const did = deviceId;
		valuesFetchFailed = false;

		// Fetch all keys for the current panel.
		// Cached values stay visible (stale-while-revalidate) while fresh values load.
		// Drift detection is handled globally by the layout's prefetch — not here.
		const allKeys = collectPanelKeys(schemaPanel);
		const existing = deviceState.deviceValues[did] ?? {};
		const keysToFetch = allKeys;
		if (keysToFetch.length === 0) {
			loadingValues = false;
			return;
		}

		const hasAnyValues = allKeys.some((k) => existing[k] !== undefined);
		if (!hasAnyValues) loadingValues = true;
		else revalidatingValues = true;

		try {
			const token = await logtoClient.getIdToken();
			if (!token || signal?.aborted) return;

			if (!deviceState.deviceValues[did]) {
				deviceState.deviceValues[did] = {};
			}

			const chunks = chunkArray(keysToFetch, 150);
			await Promise.all(
				chunks.map(async (chunk) => {
					if (signal?.aborted) return;
					try {
						const response = await fetchSettingsAsync(did, chunk, token, { signal });
						if (signal?.aborted) return;
						if (response.items) {
							const vals = (deviceState.deviceValues[did] ??= {});
							for (const item of response.items) {
								if (item.key && item.value !== undefined) {
									// Preserve user's optimistic value for keys with in-flight changes
									const pc = pendingChanges.getForKey(did, item.key);
									const pcActive =
										pc &&
										(pc.status === 'pending' ||
											pc.status === 'pushing' ||
											pc.status === 'blocked_onroad');
									if (batchPush.hasPendingKey(did, item.key) || pcActive) continue;
									vals[item.key] = decodeParamValue({
										key: item.key,
										value: item.value,
										type: item.type ?? 'String'
									});
								}
							}
						}
					} catch (e) {
						if ((e as any)?.name === 'AbortError') return;
						console.error('Failed to fetch chunk:', e);
					}
				})
			);

			if (signal?.aborted) return;

			// Fill defaults for keys the device didn't return
			if (schemaPanel) {
				const vals = (deviceState.deviceValues[did] ??= {});
				const allItems = [
					...(schemaPanel.items ?? []),
					...(schemaPanel.sub_panels ?? []).flatMap((sp) => sp.items),
					...(schemaPanel.sections ?? []).flatMap((s) => [
						...s.items,
						...(s.sub_panels ?? []).flatMap((sp) => sp.items)
					])
				];
				for (const item of allItems) {
					if (vals[item.key] === undefined) {
						if (item.widget === 'toggle') vals[item.key] = false;
						else if (item.widget === 'option' || item.widget === 'multiple_button')
							vals[item.key] = item.options?.[0]?.value ?? '';
						else vals[item.key] = '';
					}
				}
			}
		} catch (e) {
			if ((e as any)?.name === 'AbortError') return;
			console.error('Failed to fetch schema values:', e);
			valuesFetchFailed = true;
		} finally {
			if (!signal?.aborted) {
				loadingValues = false;
				revalidatingValues = false;
				deviceState.valuesVerifiedThisSession[did] = true;
				// Defensive: also clear valuesStale here so the SyncStatusIndicator
				// can stop spinning even if the layout prefetch silently fails.
				deviceState.valuesStale[did] = false;
				statusPolling.confirmReachable(did);
			}
		}
	}

	async function fetchCurrentValues(signal?: AbortSignal) {
		if (!deviceId || !logtoClient) return;
		const did = deviceId; // capture for async closures

		const keysToFetch = categorySettings.map((s) => s.key);
		if (keysToFetch.length === 0) return;

		loadingValues = true;

		try {
			const token = await logtoClient.getIdToken();
			if (!token || signal?.aborted) return;

			if (!deviceState.deviceValues[did]) {
				deviceState.deviceValues[did] = {};
			}

			// Parallel chunk fetching
			const chunks = chunkArray(keysToFetch, 150);
			await Promise.all(
				chunks.map(async (chunk) => {
					if (signal?.aborted) return;
					try {
						const response = await fetchSettingsAsync(did, chunk, token, { signal });
						if (signal?.aborted) return;
						if (response.items) {
							const vals = (deviceState.deviceValues[did] ??= {});
							for (const item of response.items) {
								if (item.key && item.value !== undefined) {
									const pc = pendingChanges.getForKey(did, item.key);
									const pcActive =
										pc &&
										(pc.status === 'pending' ||
											pc.status === 'pushing' ||
											pc.status === 'blocked_onroad');
									if (batchPush.hasPendingKey(did, item.key) || pcActive) continue;
									const def = categorySettings.find((s) => s.key === item.key);
									const type = def?.value?.type ?? 'String';
									vals[item.key] = decodeParamValue({
										key: item.key,
										value: item.value,
										type
									});
								}
							}
						}
					} catch (e) {
						if ((e as any)?.name === 'AbortError') return;
						console.error('Failed to fetch chunk of values:', e);
					}
				})
			);
		} catch (e) {
			if ((e as any)?.name === 'AbortError') return;
			console.error('Failed to fetch current values:', e);
		} finally {
			if (!signal?.aborted) {
				loadingValues = false;
				revalidatingValues = false;
				deviceState.valuesVerifiedThisSession[did] = true;
				// Layout prefetch never runs for legacy devices (no schema), so it
				// can't clear valuesStale. Do it here instead — otherwise the
				// SyncStatusIndicator spinner spins forever after a manual refresh.
				deviceState.valuesStale[did] = false;
				statusPolling.confirmReachable(did);
			}
		}
	}

	async function handlePushSuccess() {
		// Refresh values + capabilities after push
		if (useSchema) {
			fetchSchemaValues();
			if (deviceId && logtoClient) {
				const token = await logtoClient.getIdToken();
				if (token) schemaState.refreshCapabilities(deviceId, token);
			}
		} else {
			fetchCurrentValues();
		}
		toast.success('Settings pushed successfully!');
	}

	function handleManualRefresh() {
		if (!deviceId || !logtoClient) return;
		// Set stale immediately for instant "Refreshing..." feedback.
		deviceState.valuesStale[deviceId] = true;
		logtoClient.getIdToken().then((token) => {
			if (!token || !deviceId) return;
			// checkDeviceStatus already calls fetchParamsMetadata internally and
			// pipes the result into schemaState.schemas (capabilities included),
			// so a separate refreshCapabilities() call here would be a duplicate
			// paramsMetadata round-trip on top of the same one inside the status
			// check. Keep this to a single status-check call.
			checkDeviceStatus(deviceId, token, true, false);
			// For legacy devices the layout prefetch is a no-op (it gates on
			// schemaState.hasSchema). Kick the per-page values fetch directly so
			// the user sees fresh values + the spinner has something to wait on.
			if (!useSchema && categorySettings.length > 0) {
				fetchCurrentValues();
			}
		});
	}

	/** Group settings by their section headers for grouped card rendering */
	function groupSettingsBySection(
		settings: RenderableSetting[]
	): { label: string | null; settings: RenderableSetting[] }[] {
		const groups: { label: string | null; settings: RenderableSetting[] }[] = [];
		let current: { label: string | null; settings: RenderableSetting[] } = {
			label: null,
			settings: []
		};

		for (const s of settings) {
			if (s.isSection) {
				if (current.settings.length > 0) groups.push(current);
				current = { label: s.label || null, settings: [] };
			} else {
				current.settings.push(s);
			}
		}
		if (current.settings.length > 0) groups.push(current);
		return groups;
	}
</script>

<div class="space-y-5" class:pb-16={hasChanges && !useSchema}>
	<AlwaysOffroadPrompt />
	<div class="mx-auto w-full max-w-2xl xl:max-w-3xl" style="display: grid;">
		{#key activeSubPanel?.id ?? '__root__'}
			<div
				style="grid-area: 1 / 1;"
				in:fly={{ x: subPanelDirection === 'forward' ? 60 : -60, duration: 200, delay: 120 }}
				out:fly={{ x: subPanelDirection === 'forward' ? -30 : 30, duration: 120 }}
			>
				{#if activeSubPanel}
					<BackLink label={schemaPanel?.label ?? category} fallback={closeSubPanel} />
					<div class="px-4">
						<h2
							class="flex items-baseline gap-3 text-[24px] leading-[32px] font-medium tracking-[-0.16px] text-[var(--sl-text-1)]"
						>
							<span>{activeSubPanel.label}</span>
							<SyncStatusIndicator status={sync.status} onRefresh={handleManualRefresh} />
						</h2>
					</div>
				{:else}
					<div class="px-4">
						<h2
							class="flex items-baseline gap-3 text-[24px] leading-[32px] font-medium tracking-[-0.16px] text-[var(--sl-text-1)] capitalize"
						>
							<span>{schemaPanel?.label ?? category}</span>
							<SyncStatusIndicator status={sync.status} onRefresh={handleManualRefresh} />
						</h2>
						{#if schemaPanel?.description}
							<p class="mt-2 text-[0.8125rem] font-[450] text-[var(--sl-text-2)]">
								{schemaPanel.description}
							</p>
						{/if}
					</div>
				{/if}
			</div>
		{/key}
	</div>

	{#if !deviceId}
		{#await data.streamed.deviceResult then result}
			{@const devs = result.devices ?? []}
			<div class="flex flex-col items-center justify-center py-12 text-center">
				<div class="mb-4 rounded-full bg-[var(--sl-border)] p-4">
					<svg
						xmlns="http://www.w3.org/2000/svg"
						class="h-12 w-12 text-[var(--sl-text-2)]"
						fill="none"
						viewBox="0 0 24 24"
						stroke="currentColor"
					>
						<path
							stroke-linecap="round"
							stroke-linejoin="round"
							stroke-width="2"
							d="M12 6v6m0 0v6m0-6h6m-6 0H6"
						/>
					</svg>
				</div>
				<h3 class="text-xl font-semibold text-[var(--sl-text-1)]">No Device Selected</h3>
				<p class="mt-2 max-w-md text-[var(--sl-text-2)]">
					Pick a device from My Devices to configure its settings.
				</p>
				<div class="mt-6">
					{#if devs.length > 0}
						<a
							href="/dashboard/devices"
							class="inline-flex items-center gap-2 rounded-lg border border-[var(--sl-border)] bg-[var(--sl-bg-surface)] px-4 py-2 text-sm font-medium text-[var(--sl-text-1)] transition-all duration-100 hover:bg-[var(--sl-bg-elevated)] focus-visible:outline-2 focus-visible:outline-primary active:scale-[0.97] active:bg-[var(--sl-bg-subtle)]"
						>
							Go to My Devices
						</a>
					{/if}
				</div>
			</div>
		{/await}
	{:else if !isDeviceOfflineOrError && (deviceOnlineStatus === undefined || isDeviceLoading || schemaLoading || legacyAwaitingSettings)}
		<!-- Connecting covers the device handshake, schema decision, AND the
		     legacy V1 settings phase. Without the legacy gate the page would
		     fall through to the legacy branch with categorySettings consisting
		     of section markers only (the explicit defs filter out until V1
		     populates each setting's `value`). Result: writableSettings.length
		     is 0, the conditional `{#if writableSettings.length > 0}` guard
		     fails, and the entire content area renders nothing — a blank
		     screen between "Connecting..." disappearing and the V1 response
		     arriving a couple seconds later. -->
		<div class="mx-auto w-full max-w-2xl xl:max-w-3xl">
			<div
				class="flex flex-col items-center justify-center gap-3 rounded-xl border border-[var(--sl-border)] bg-[var(--sl-bg-surface)] px-4 py-12 text-center"
			>
				<span class="loading loading-md loading-spinner text-primary"></span>
				<p class="text-[0.8125rem] font-[450] text-[var(--sl-text-3)]">Connecting to device...</p>
			</div>
		</div>
	{:else if useSchema && schemaPanel}
		<!-- ═══ Schema-driven rendering (centered narrow column, grouped cards) ═══ -->
		<div class="mx-auto w-full max-w-2xl xl:max-w-3xl" style="display: grid;">
			{#key activeSubPanel?.id ?? '__root__'}
				<div
					style="grid-area: 1 / 1;"
					in:fly={{ x: subPanelDirection === 'forward' ? 60 : -60, duration: 200, delay: 120 }}
					out:fly={{ x: subPanelDirection === 'forward' ? -30 : 30, duration: 120 }}
				>
					{#if activeSubPanel}
						<div
							class="overflow-hidden rounded-xl border border-[var(--sl-border)] bg-[var(--sl-bg-surface)]"
						>
							{#each activeSubPanel.items as item, i (item.key)}
								<SchemaItemRenderer
									{deviceId}
									{item}
									loadingValues={showValueSkeleton}
									isLast={i === activeSubPanel.items.length - 1}
								/>
							{/each}
						</div>
					{:else}
						<SchemaPanel
							{deviceId}
							panel={schemaPanel}
							loadingValues={showValueSkeleton}
							onSubPanelOpen={openSubPanel}
						/>
					{/if}
				</div>
			{/key}
		</div>
	{:else if useSchema && !schemaPanel}
		<!-- Schema loaded but no panel for this category — render with unified style -->
		{#if writableSettings.length > 0}
			<div class="mx-auto w-full max-w-2xl space-y-6 xl:max-w-3xl">
				{#each writableGroups as group (group.label ?? '__default__')}
					{#if group.label}
						<div class="px-4">
							<p class="text-[0.9375rem] font-medium text-[var(--sl-text-1)]">{group.label}</p>
						</div>
					{/if}
					<div
						class="overflow-hidden rounded-xl border border-[var(--sl-border)] bg-[var(--sl-bg-surface)]"
					>
						{#each group.settings as setting, i (setting.key)}
							<SchemaItemRenderer
								{deviceId}
								item={settingToSchemaItem(setting)}
								loadingValues={showValueSkeleton}
								isLast={i === group.settings.length - 1}
							/>
						{/each}
					</div>
				{/each}
			</div>
		{/if}
	{:else if categorySettings.length === 0}
		<div class="alert border-none bg-[var(--sl-bg-elevated)] text-[var(--sl-text-2)]">
			<span>No settings found for this category.</span>
		</div>
	{:else}
		<!-- ═══ Legacy rendering (no schema available) — unified style ═══ -->
		{#if writableSettings.length > 0}
			<div class="mx-auto w-full max-w-2xl space-y-6 xl:max-w-3xl">
				{#each writableGroups as group (group.label ?? '__default__')}
					{#if group.label}
						<div class="px-4">
							<p class="text-[0.9375rem] font-medium text-[var(--sl-text-1)]">{group.label}</p>
						</div>
					{/if}
					<div
						class="overflow-hidden rounded-xl border border-[var(--sl-border)] bg-[var(--sl-bg-surface)]"
					>
						{#each group.settings as setting, i (setting.key)}
							<SchemaItemRenderer
								{deviceId}
								item={settingToSchemaItem(setting)}
								loadingValues={showValueSkeleton}
								isLast={i === group.settings.length - 1}
							/>
						{/each}
					</div>
				{/each}
			</div>
		{/if}

		{#if readonlySettings.length > 0}
			<div class="mx-auto w-full max-w-2xl xl:max-w-3xl">
				<details
					class="group mt-8 rounded-xl border border-[var(--sl-border)] bg-[var(--sl-bg-surface)] open:bg-[var(--sl-bg-input)]"
				>
					<summary
						class="flex cursor-pointer items-center justify-between p-4 font-medium text-[var(--sl-text-2)] hover:text-[var(--sl-text-1)]"
					>
						<span>Read-Only Settings ({readonlySettings.length})</span>
						<span class="transition-transform group-open:rotate-180">
							<svg
								xmlns="http://www.w3.org/2000/svg"
								width="20"
								height="20"
								viewBox="0 0 24 24"
								fill="none"
								stroke="currentColor"
								stroke-width="2"
								stroke-linecap="round"
								stroke-linejoin="round"><path d="m6 9 6 6 6-6" /></svg
							>
						</span>
					</summary>
					<div class="border-t border-[var(--sl-border)] p-4">
						{#each readonlyGroups as group (group.label ?? '__ro_default__')}
							{#if group.label}
								<div class="mt-4 mb-2 first:mt-0">
									<p class="text-[0.9375rem] font-medium text-[var(--sl-text-1)]">{group.label}</p>
								</div>
							{/if}
							<div
								class="overflow-hidden rounded-xl border border-[var(--sl-border)] bg-[var(--sl-bg-surface)]"
							>
								{#each group.settings as setting, i (setting.key)}
									<SchemaItemRenderer
										{deviceId}
										item={settingToSchemaItem(setting)}
										loadingValues={showValueSkeleton}
										isLast={i === group.settings.length - 1}
										readonly={true}
									/>
								{/each}
							</div>
						{/each}
					</div>
				</details>
			</div>
		{/if}
	{/if}
</div>

<!-- Action bar + push modal only for legacy (non-schema) rendering -->
{#if !useSchema}
	<SettingsActionBar
		onPush={() => (pushModalOpen = true)}
		onReset={() => deviceId && deviceState.clearChanges(deviceId)}
	/>

	<PushSettingsModal
		bind:open={pushModalOpen}
		onPushSuccess={handlePushSuccess}
		alias={currentDeviceAlias}
	/>
{/if}

<!-- Screen-reader announcement for highlight deep-link jumps. -->
<span class="sr-only" role="status" aria-live="polite">{highlightAnnouncement}</span>
