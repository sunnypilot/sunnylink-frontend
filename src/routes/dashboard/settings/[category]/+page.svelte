<script lang="ts">
	import { page } from '$app/state';
	import { goto, beforeNavigate } from '$app/navigation';
	import { deviceState } from '$lib/stores/device.svelte';
	import { schemaState } from '$lib/stores/schema.svelte';
	import { searchState } from '$lib/stores/search.svelte';
	import { toastState } from '$lib/stores/toast.svelte';
	import {
		SETTINGS_DEFINITIONS,
		type SettingCategory,
		type RenderableSetting
	} from '$lib/types/settings';
	import type { Panel, SubPanel } from '$lib/types/schema';
	import { fetchSettingsAsync } from '$lib/api/device';
	import { logtoClient } from '$lib/logto/auth.svelte';
	import { decodeParamValue } from '$lib/utils/device';
	import { getAllSettings } from '$lib/utils/settings';
	import { searchSettings } from '$lib/utils/search';
	import { loadCachedValues } from '$lib/stores/valuesCache';
	import { detectDrift, filterMeaningfulDrift } from '$lib/utils/drift';
	import { driftStore } from '$lib/stores/driftStore.svelte';
	import { pendingChanges } from '$lib/stores/pendingChanges.svelte';
	import { settingToSchemaItem } from '$lib/utils/settingAdapter';

	import { untrack } from 'svelte';
	import { fly, fade } from 'svelte/transition';
	import DeviceSelector from '$lib/components/DeviceSelector.svelte';
	import SettingsActionBar from '$lib/components/SettingsActionBar.svelte';
	import PushSettingsModal from '$lib/components/PushSettingsModal.svelte';
	import SettingCard from '$lib/components/SettingCard.svelte';
	import SchemaPanel from '$lib/components/schema/SchemaPanel.svelte';
	import SchemaItemRenderer from '$lib/components/schema/SchemaItemRenderer.svelte';

	let { data } = $props();

	let devices = $state<any[]>([]);

	$effect(() => {
		if (data.streamed.deviceResult) {
			data.streamed.deviceResult.then((result: any) => {
				devices = result.devices || [];
			});
		}
	});

	let category = $derived(page.params.category as SettingCategory);
	let deviceId = $derived(deviceState.selectedDeviceId);
	let settings = $derived(deviceId ? deviceState.deviceSettings[deviceId] : undefined);
	let deviceValues = $derived(deviceId ? deviceState.deviceValues[deviceId] : undefined);
	let hasChanges = $derived(deviceId ? deviceState.hasChanges(deviceId) : false);

	// ── Schema-driven rendering ─────────────────────────────────────────────

	let useSchema = $derived(deviceId ? schemaState.hasSchema(deviceId) : false);
	// True while schema is being fetched — show skeleton instead of legacy flash
	let schemaLoading = $derived(deviceId ? !!schemaState.loading[deviceId] : false);

	// Find the matching schema panel for this category
	let schemaPanel: Panel | undefined = $derived.by(() => {
		if (!deviceId || !useSchema) return undefined;
		const schema = schemaState.schemas[deviceId];
		if (!schema) return undefined;
		return schema.panels.find((p) => p.id === category);
	});

	// Load schema when device is selected
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

	// ── Legacy rendering ────────────────────────────────────────────────────

	let currentDeviceAlias = $derived.by(() => {
		if (!deviceId) return undefined;
		const device = devices.find((d) => d.device_id === deviceId);
		return deviceState.aliases[deviceId] ?? device?.alias ?? deviceId;
	});

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

	// ── Value fetching ──────────────────────────────────────────────────────

	let loadingValues = $state(false);
	let revalidatingValues = $state(false);
	let valuesFetchFailed = $state(false);

	// Schema revalidation status from the store
	let schemaRevalStatus = $derived(
		deviceId ? schemaState.revalidationStatus[deviceId] ?? null : null
	);

	// True when any background work is in-flight
	let isRevalidating = $derived(
		revalidatingValues || schemaRevalStatus === 'revalidating'
	);

	// Overall revalidation succeeded only if nothing failed
	let revalidationSucceeded = $derived(
		!revalidatingValues && !valuesFetchFailed &&
		schemaRevalStatus !== 'revalidating' && schemaRevalStatus !== 'failed'
	);

	// ── Sync status pill state machine ──────────────────────────────────
	// 'idle' → 'revalidating' → 'synced' | 'failed' (3s) → 'idle'
	let syncStatus: 'idle' | 'revalidating' | 'synced' | 'failed' = $state('idle');
	let syncTimerId: ReturnType<typeof setTimeout> | undefined = undefined;

	function clearSyncTimer() {
		if (syncTimerId !== undefined) {
			clearTimeout(syncTimerId);
			syncTimerId = undefined;
		}
	}

	// Only track isRevalidating — read/write syncStatus inside untrack
	$effect(() => {
		const revalidating = isRevalidating; // tracked
		const succeeded = revalidationSucceeded; // tracked

		untrack(() => {
			if (revalidating && syncStatus !== 'revalidating') {
				clearSyncTimer();
				syncStatus = 'revalidating';
			} else if (!revalidating && syncStatus === 'revalidating') {
				syncStatus = succeeded ? 'synced' : 'failed';
				syncTimerId = setTimeout(() => {
					syncStatus = 'idle';
					syncTimerId = undefined;
				}, 3000);
			}
		});
	});

	// Reset loading state on category change
	$effect(() => {
		category; // track
		loadingValues = false;
		revalidatingValues = false;
		valuesFetchFailed = false;
		untrack(() => {
			syncStatus = 'idle';
			clearSyncTimer();
		});
	});
	let jsonModalOpen = $state(false);
	let jsonModalContent = $state('');
	let jsonModalTitle = $state('');
	let pushModalOpen = $state(false);

	// Fetch values for schema-driven rendering (cancels on nav away)
	$effect(() => {
		if (deviceId && logtoClient && useSchema && schemaPanel) {
			const controller = new AbortController();
			fetchSchemaValues(controller.signal);
			return () => controller.abort();
		}
	});

	// Fetch values for legacy rendering (cancels on nav away)
	$effect(() => {
		if (deviceId && logtoClient && !useSchema && categorySettings.length > 0) {
			const controller = new AbortController();
			fetchCurrentValues(controller.signal);
			return () => controller.abort();
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
		for (const item of panel.items) addItem(item);
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
		const did = deviceId; // capture for async closures
		valuesFetchFailed = false;

		// Skip keys we already have values for (delta fetch)
		const allKeys = collectPanelKeys(schemaPanel);
		const existing = deviceState.deviceValues[did] ?? {};
		const keysToFetch = allKeys.filter((k) => existing[k] === undefined);
		if (keysToFetch.length === 0) {
			// All cached — ensure spinner is cleared (may be stuck from an aborted prior fetch)
			loadingValues = false;
			return;
		}

		// Snapshot cached values before fetch for drift detection
		const gitCommit = (existing['GitCommit'] as string) || '';
		const cachedSnapshot = gitCommit ? loadCachedValues(did, gitCommit) : null;

		// Show full spinner only on cold start (no cached values at all)
		// Show subtle revalidation indicator for delta-fetches
		const hasAnyValues = allKeys.some((k) => existing[k] !== undefined);
		if (!hasAnyValues) loadingValues = true;
		else revalidatingValues = true;
		try {
			const token = await logtoClient.getIdToken();
			if (!token || signal?.aborted) return;

			if (!deviceState.deviceValues[did]) {
				deviceState.deviceValues[did] = {};
			}

			// Parallel chunk fetching — all chunks fire simultaneously
			const chunks = chunkArray(keysToFetch, 10);
			const freshValues: Record<string, unknown> = {};
			await Promise.all(
				chunks.map(async (chunk) => {
					if (signal?.aborted) return;
					try {
						const response = await fetchSettingsAsync(did, chunk, token, { signal });
						if (signal?.aborted) return;
						if (response.items) {
							const vals = deviceState.deviceValues[did] ??= {};
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
					} catch (e) {
						if ((e as any)?.name === 'AbortError') return;
						console.error('Failed to fetch chunk:', e);
					}
				})
			);

			if (signal?.aborted) return;

			// Fill defaults for keys the device didn't return a value for.
			// This prevents toggles from staying in a "loading" shimmer state
			// when the param simply doesn't exist on the device yet.
			if (schemaPanel) {
				const vals = deviceState.deviceValues[did] ??= {};
				// Collect all items from flat items, sub_panels, and sections
				const allItems = [
					...schemaPanel.items,
					...(schemaPanel.sub_panels ?? []).flatMap(sp => sp.items),
					...(schemaPanel.sections ?? []).flatMap(s => [
						...s.items,
						...(s.sub_panels ?? []).flatMap(sp => sp.items)
					])
				];
				for (const item of allItems) {
					if (vals[item.key] === undefined) {
						// Use widget-appropriate defaults
						if (item.widget === 'toggle') vals[item.key] = false;
						else if (item.widget === 'option' || item.widget === 'multiple_button') vals[item.key] = item.options?.[0]?.value ?? '';
						else vals[item.key] = '';
					}
				}
			}

			// Drift detection: compare cached snapshot → fresh values
			if (cachedSnapshot && Object.keys(freshValues).length > 0) {
				const allDrifts = detectDrift(cachedSnapshot, freshValues);
				const pending = pendingChanges.getAll(did);
				const meaningful = filterMeaningfulDrift(allDrifts, pending);
				if (meaningful.length > 0) {
					driftStore.setDrifts(did, meaningful);
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
			const chunks = chunkArray(keysToFetch, 10);
			await Promise.all(
				chunks.map(async (chunk) => {
					if (signal?.aborted) return;
					try {
						const response = await fetchSettingsAsync(did, chunk, token, { signal });
						if (signal?.aborted) return;
						if (response.items) {
							const vals = deviceState.deviceValues[did] ??= {};
							for (const item of response.items) {
								if (item.key && item.value !== undefined) {
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
			if (!signal?.aborted) loadingValues = false;
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
		toastState.show('Settings pushed successfully!', 'success');
	}

	function syntaxHighlightJson(json: string): string {
		if (!json) return '';
		json = json.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
		return json.replace(
			/("(\\u[a-zA-Z0-9]{4}|\\[^u]|[^\\"])*"(\s*:)?|\b(true|false|null)\b|-?\d+(?:\.\d*)?(?:[eE][+\-]?\d+)?)/g,
			function (match) {
				let cls = 'text-orange-400';
				if (/^"/.test(match)) {
					if (/:$/.test(match)) {
						cls = 'text-blue-400';
					} else {
						cls = 'text-green-400';
					}
				} else if (/true|false/.test(match)) {
					cls = 'text-purple-400';
				} else if (/null/.test(match)) {
					cls = 'text-gray-400';
				}
				return '<span class="' + cls + '">' + match + '</span>';
			}
		);
	}

	/** Group settings by their section headers for grouped card rendering */
	function groupSettingsBySection(settings: RenderableSetting[]): { label: string | null; settings: RenderableSetting[] }[] {
		const groups: { label: string | null; settings: RenderableSetting[] }[] = [];
		let current: { label: string | null; settings: RenderableSetting[] } = { label: null, settings: [] };

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

	function openJsonModal(title: string, content: any) {
		jsonModalTitle = title;
		const formatted = JSON.stringify(content, null, 2);
		jsonModalContent = syntaxHighlightJson(formatted);
		jsonModalOpen = true;
	}
</script>

<div class="space-y-4" class:pb-16={hasChanges && !useSchema}>
	<!-- ── Page Header ──────────────────────────────────────────────────── -->
	<div class="mx-auto w-full max-w-2xl xl:max-w-3xl" style="display: grid;">
		{#key activeSubPanel?.id ?? '__root__'}
			<div
				style="grid-area: 1 / 1;"
				in:fly={{ x: subPanelDirection === 'forward' ? 60 : -60, duration: 200, delay: 120 }}
				out:fly={{ x: subPanelDirection === 'forward' ? -30 : 30, duration: 120 }}
			>
				{#if activeSubPanel}
					<div class="px-4">
						<button
							class="row-press mb-1 flex items-center gap-1 rounded px-1 py-0.5 text-[0.8125rem] text-[var(--sl-text-3)] transition-colors hover:text-[var(--sl-text-1)]"
							onclick={closeSubPanel}
						>
							<svg
								xmlns="http://www.w3.org/2000/svg"
								width="14"
								height="14"
								viewBox="0 0 24 24"
								fill="none"
								stroke="currentColor"
								stroke-width="2"
								stroke-linecap="round"
								stroke-linejoin="round"><path d="m15 18-6-6 6-6" /></svg
							>
							{schemaPanel?.label ?? category}
						</button>
						<h2 class="text-[24px] font-medium leading-[32px] tracking-[-0.16px] text-[var(--sl-text-1)]">
							{activeSubPanel.label}
						</h2>
					</div>
				{:else}
					<div class="px-4">
						<h2 class="flex items-baseline gap-3 text-[24px] font-medium leading-[32px] tracking-[-0.16px] text-[var(--sl-text-1)] capitalize">
							<span>{schemaPanel?.label ?? category}</span>
							{#if loadingValues}
								<span class="loading loading-spinner loading-xs text-primary" style="align-self: center;"></span>
							{:else if syncStatus !== 'idle'}
								<span class="inline-flex items-center gap-1.5" transition:fade={{ duration: 150 }}>
									{#if syncStatus === 'revalidating'}
										<span class="loading loading-spinner text-[var(--sl-text-3)]" style="width: 12px; height: 12px;"></span>
										<span class="text-[0.8125rem] font-normal text-[var(--sl-text-3)]">Refreshing...</span>
									{:else if syncStatus === 'synced'}
										<svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" class="text-emerald-500"><path d="M20 6 9 17l-5-5" /></svg>
										<span class="text-[0.8125rem] font-normal text-emerald-500/80">Up to date</span>
									{:else if syncStatus === 'failed'}
										<svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="text-amber-500"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
										<span class="text-[0.8125rem] font-normal text-amber-500/80">Could not refresh</span>
									{/if}
								</span>
							{/if}
						</h2>
						{#if schemaPanel?.description}
							<p class="mt-1 text-[0.8125rem] font-[450] text-[var(--sl-text-2)]">{schemaPanel.description}</p>
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
					Please select a device to configure its settings.
				</p>
				<div class="mt-6">
					{#if devs.length > 0}
						<DeviceSelector devices={devs} />
					{/if}
				</div>
			</div>
		{/await}
	{:else if !useSchema && (schemaLoading || (!settings && !categorySettings.length))}
		<!-- Show spinner while schema loads — prevents legacy layout flash -->
		<div class="flex justify-center p-12">
			<span class="loading loading-lg loading-spinner text-primary"></span>
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
						<div class="overflow-hidden rounded-xl border border-[var(--sl-border)] bg-[var(--sl-bg-surface)]">
							{#each activeSubPanel.items as item, i (item.key)}
								<SchemaItemRenderer {deviceId} {item} {loadingValues} isLast={i === activeSubPanel.items.length - 1} />
							{/each}
						</div>
					{:else}
						<SchemaPanel
							{deviceId}
							panel={schemaPanel}
							{loadingValues}
							onSubPanelOpen={openSubPanel}
						/>
					{/if}
				</div>
			{/key}
		</div>
	{:else if useSchema && !schemaPanel}
		<!-- Schema loaded but no panel for this category — render with unified style -->
		{#if writableSettings.length > 0}
			<div class="mx-auto w-full max-w-2xl xl:max-w-3xl space-y-6">
					{#each writableGroups as group (group.label ?? '__default__')}
					{#if group.label}
						<p class="mb-2 px-4 text-xs font-semibold tracking-wider text-[var(--sl-text-3)] uppercase">
							{group.label}
						</p>
					{/if}
					<div class="overflow-hidden rounded-xl border border-[var(--sl-border)] bg-[var(--sl-bg-surface)]">
						{#each group.settings as setting, i (setting.key)}
							<SchemaItemRenderer
								{deviceId}
								item={settingToSchemaItem(setting)}
								{loadingValues}
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
			<div class="mx-auto w-full max-w-2xl xl:max-w-3xl space-y-6">
					{#each writableGroups as group (group.label ?? '__default__')}
					{#if group.label}
						<p class="mb-2 px-4 text-xs font-semibold tracking-wider text-[var(--sl-text-3)] uppercase">
							{group.label}
						</p>
					{/if}
					<div class="overflow-hidden rounded-xl border border-[var(--sl-border)] bg-[var(--sl-bg-surface)]">
						{#each group.settings as setting, i (setting.key)}
							<SchemaItemRenderer
								{deviceId}
								item={settingToSchemaItem(setting)}
								{loadingValues}
								isLast={i === group.settings.length - 1}
							/>
						{/each}
					</div>
				{/each}
			</div>
		{/if}

		{#if readonlySettings.length > 0}
			<div class="mx-auto w-full max-w-2xl xl:max-w-3xl">
				<details class="group mt-8 rounded-xl border border-[var(--sl-border)] bg-[var(--sl-bg-surface)] open:bg-[var(--sl-bg-input)]">
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
								<p class="mt-4 mb-2 px-1 text-xs font-semibold tracking-wider text-[var(--sl-text-3)] uppercase first:mt-0">
									{group.label}
								</p>
							{/if}
							<div class="overflow-hidden rounded-xl border border-[var(--sl-border)] bg-[var(--sl-bg-surface)]">
								{#each group.settings as setting, i (setting.key)}
									<SchemaItemRenderer
										{deviceId}
										item={settingToSchemaItem(setting)}
										{loadingValues}
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

<!-- JSON Modal -->
{#if jsonModalOpen}
	<div class="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
		<div class="w-full max-w-3xl rounded-xl border border-[var(--sl-border)] bg-[var(--sl-bg-elevated)] p-6 shadow-2xl">
			<div class="mb-4 flex items-center justify-between">
				<h3 class="text-lg font-bold text-[var(--sl-text-1)]">{jsonModalTitle}</h3>
				<button
					class="btn btn-circle text-[var(--sl-text-2)] btn-ghost btn-sm"
					onclick={() => (jsonModalOpen = false)}
				>
					✕
				</button>
			</div>
			<div class="max-h-[60vh] overflow-auto rounded-lg bg-[var(--sl-bg-input)] p-4">
				<div class="flex font-mono text-xs">
					<div class="mr-4 text-right text-slate-600 select-none">
						{#each jsonModalContent.split('\n') as _, i}
							<div>{i + 1}</div>
						{/each}
					</div>
					<pre class="text-[var(--sl-text-2)]">{@html jsonModalContent}</pre>
				</div>
			</div>
			<div class="mt-6 flex justify-end">
				<button class="btn btn-primary" onclick={() => (jsonModalOpen = false)}>Close</button>
			</div>
		</div>
	</div>
{/if}
