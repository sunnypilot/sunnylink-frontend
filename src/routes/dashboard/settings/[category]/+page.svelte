<script lang="ts">
	import { page } from '$app/state';
	import { goto } from '$app/navigation';
	import { deviceState } from '$lib/stores/device.svelte';
	import { schemaState } from '$lib/stores/schema.svelte';
	import { preferences } from '$lib/stores/preferences.svelte';
	import { searchState } from '$lib/stores/search.svelte';
	import { toastState } from '$lib/stores/toast.svelte';
	import {
		SETTINGS_DEFINITIONS,
		type SettingCategory,
		type RenderableSetting
	} from '$lib/types/settings';
	import type { Panel, SubPanel } from '$lib/types/schema';
	import { checkDeviceStatus, fetchSettingsAsync } from '$lib/api/device';
	import { logtoClient } from '$lib/logto/auth.svelte';
	import { decodeParamValue } from '$lib/utils/device';
	import { getAllSettings } from '$lib/utils/settings';
	import { searchSettings } from '$lib/utils/search';

	import DeviceSelector from '$lib/components/DeviceSelector.svelte';
	import SettingsActionBar from '$lib/components/SettingsActionBar.svelte';
	import PushSettingsModal from '$lib/components/PushSettingsModal.svelte';
	import DeviceOnlineModal from '$lib/components/DeviceOnlineModal.svelte';
	import SettingCard from '$lib/components/SettingCard.svelte';
	import SchemaPanel from '$lib/components/schema/SchemaPanel.svelte';
	import SchemaItemRenderer from '$lib/components/schema/SchemaItemRenderer.svelte';

	let { data } = $props();

	let devices = $state<any[]>([]);

	$effect(() => {
		if (data.streamed.devices) {
			data.streamed.devices.then((d) => {
				devices = d || [];
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

	// Sub-panel state
	let activeSubPanel: SubPanel | null = $state(null);

	function openSubPanel(subPanel: SubPanel) {
		activeSubPanel = subPanel;
	}

	function closeSubPanel() {
		activeSubPanel = null;
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

	// ── Value fetching ──────────────────────────────────────────────────────

	let loadingValues = $state(false);
	let loadingProgress = $state('');
	let jsonModalOpen = $state(false);
	let jsonModalContent = $state('');
	let jsonModalTitle = $state('');
	let pushModalOpen = $state(false);
	let deviceOnlineModalOpen = $state(false);

	$effect(() => {
		if (deviceId) {
			if (preferences.showDeviceOnlineHelp) {
				deviceOnlineModalOpen = true;
			}
		}
	});

	// Fetch values for schema-driven rendering
	$effect(() => {
		if (deviceId && logtoClient && useSchema && schemaPanel) {
			fetchSchemaValues();
		}
	});

	// Fetch values for legacy rendering
	$effect(() => {
		if (deviceId && logtoClient && !useSchema && categorySettings.length > 0) {
			fetchCurrentValues();
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

	/** Collect all param keys from a schema panel (items + sub_items + sub_panels) */
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
		return keys;
	}

	async function fetchSchemaValues() {
		if (!deviceId || !logtoClient || !schemaPanel) return;

		const keysToFetch = collectPanelKeys(schemaPanel);
		if (keysToFetch.length === 0) return;

		loadingValues = true;
		try {
			const token = await logtoClient.getIdToken();
			if (!token) return;

			const chunks = chunkArray(keysToFetch, 10);
			let fetchedCount = 0;

			for (const chunk of chunks) {
				try {
					const response = await fetchSettingsAsync(deviceId, chunk, token);
					if (response.items) {
						if (!deviceState.deviceValues[deviceId]) {
							deviceState.deviceValues[deviceId] = {};
						}
						for (const item of response.items) {
							if (item.key && item.value !== undefined) {
								deviceState.deviceValues[deviceId][item.key] = decodeParamValue({
									key: item.key,
									value: item.value,
									type: item.type ?? 'String'
								});
							}
						}
					}
				} catch (e) {
					console.error('Failed to fetch chunk:', e);
				} finally {
					fetchedCount += chunk.length;
					loadingProgress = `${Math.round((fetchedCount / keysToFetch.length) * 100)}%`;
				}
			}
		} catch (e) {
			console.error('Failed to fetch schema values:', e);
		} finally {
			loadingValues = false;
			loadingProgress = '';
		}
	}

	async function fetchCurrentValues() {
		if (!deviceId || !logtoClient) return;

		const keysToFetch = categorySettings.map((s) => s.key);
		if (keysToFetch.length === 0) return;

		loadingValues = true;
		let fetchedCount = 0;
		const totalCount = keysToFetch.length;
		loadingProgress = `0/${totalCount}`;

		try {
			const token = await logtoClient.getIdToken();
			if (!token) return;

			const chunks = chunkArray(keysToFetch, 10);

			for (const chunk of chunks) {
				try {
					const response = await fetchSettingsAsync(deviceId, chunk, token);

					if (response.items) {
						if (!deviceState.deviceValues[deviceId]) {
							deviceState.deviceValues[deviceId] = {};
						}

						for (const item of response.items) {
							if (item.key && item.value !== undefined) {
								const def = categorySettings.find((s) => s.key === item.key);
								const type = def?.value?.type ?? 'String';

								const decoded = decodeParamValue({
									key: item.key,
									value: item.value,
									type: type
								});

								deviceState.deviceValues[deviceId][item.key] = decoded;
							}
						}
					}
				} catch (e) {
					console.error('Failed to fetch chunk of values:', e);
				} finally {
					fetchedCount += chunk.length;
					const percentage = Math.round((fetchedCount / totalCount) * 100);
					loadingProgress = `${percentage}% loaded (${fetchedCount}/${totalCount})`;
				}
			}
		} catch (e) {
			console.error('Failed to fetch current values:', e);
		} finally {
			loadingValues = false;
			loadingProgress = '';
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

	function openJsonModal(title: string, content: any) {
		jsonModalTitle = title;
		const formatted = JSON.stringify(content, null, 2);
		jsonModalContent = syntaxHighlightJson(formatted);
		jsonModalOpen = true;
	}
</script>

<div class="space-y-6" class:pb-16={hasChanges && !useSchema}>
	<div class="flex items-center justify-between">
		<div>
			{#if activeSubPanel}
				<button
					class="mb-2 flex items-center gap-1 text-sm text-slate-400 hover:text-white"
					onclick={closeSubPanel}
				>
					<svg
						xmlns="http://www.w3.org/2000/svg"
						width="16"
						height="16"
						viewBox="0 0 24 24"
						fill="none"
						stroke="currentColor"
						stroke-width="2"
						stroke-linecap="round"
						stroke-linejoin="round"><path d="m15 18-6-6 6-6" /></svg
					>
					Back to {schemaPanel?.label ?? category}
				</button>
				<h2 class="text-2xl font-bold text-white">
					{activeSubPanel.label}
				</h2>
			{:else}
				<h2 class="text-2xl font-bold text-white capitalize">
					{schemaPanel?.label ?? category} Settings
					{#if loadingValues}
						<span class="ml-2 text-sm font-normal text-slate-400">{loadingProgress}</span>
					{/if}
				</h2>
			{/if}
			<p class="text-slate-400">
				{#if deviceId}
					{@const device = devices.find((d) => d.device_id === deviceId)}
					{@const alias = deviceState.aliases[deviceId] ?? device?.alias ?? deviceId}
					Configuring
					{#if alias && alias !== deviceId}
						<span class="font-bold text-white">{alias}</span>
						<span class="text-sm italic">({deviceId})</span>
					{:else}
						<span class="font-bold text-white">{deviceId}</span>
					{/if}
				{:else}
					Select a device to configure settings
				{/if}
			</p>
		</div>
	</div>

	{#if !deviceId}
		{#await data.streamed.devices then devices}
			<div class="flex flex-col items-center justify-center py-12 text-center">
				<div class="mb-4 rounded-full bg-slate-800 p-4">
					<svg
						xmlns="http://www.w3.org/2000/svg"
						class="h-12 w-12 text-slate-400"
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
				<h3 class="text-xl font-semibold text-white">No Device Selected</h3>
				<p class="mt-2 max-w-md text-slate-400">
					Please select a device to configure its settings.
				</p>
				<div class="mt-6">
					{#if devices}
						<DeviceSelector {devices} />
					{/if}
				</div>
			</div>
		{/await}
	{:else if deviceState.onlineStatuses[deviceId] === 'offline'}
		{#await data.streamed.devices then devices}
			{@const selectedDevice = devices?.find(
				(d: { device_id: string | null }) => d.device_id === deviceId
			)}
			<div class="flex flex-col items-center justify-center py-12 text-center">
				<div class="mb-4 rounded-full bg-red-500/10 p-4">
					<svg
						xmlns="http://www.w3.org/2000/svg"
						class="h-12 w-12 text-red-500"
						fill="none"
						viewBox="0 0 24 24"
						stroke="currentColor"
					>
						<path
							stroke-linecap="round"
							stroke-linejoin="round"
							stroke-width="2"
							d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636"
						/>
					</svg>
				</div>
				<h3 class="text-xl font-semibold text-white">
					Device Offline: {selectedDevice?.alias ?? selectedDevice?.device_id ?? 'Unknown'}
					{#if selectedDevice?.alias}
						<span class="block text-sm font-normal text-slate-400"
							>({selectedDevice?.device_id})</span
						>
					{/if}
				</h3>
				<p class="mt-2 max-w-md text-slate-400">
					This device appears to be offline. Please check its connectivity and try again.
				</p>
				<div class="mt-6 flex w-full max-w-sm flex-col items-center gap-4">
					<button
						class="btn btn-sm btn-primary"
						onclick={async () => {
							if (deviceId && logtoClient) {
								const token = await logtoClient.getIdToken();
								if (token) {
									await checkDeviceStatus(deviceId, token);
								}
							}
						}}
					>
						Retry Connection
					</button>
					<div class="divider text-xs tracking-widest text-slate-600">OR SELECT ANOTHER DEVICE</div>
					{#if devices}
						<DeviceSelector {devices} />
					{/if}
				</div>
			</div>
		{/await}
	{:else if !settings && !useSchema}
		<div class="flex justify-center p-12">
			<span class="loading loading-lg loading-spinner text-primary"></span>
		</div>
	{:else if useSchema && schemaPanel}
		<!-- ═══ Schema-driven rendering (centered narrow column) ═══ -->
		<div class="mx-auto w-full max-w-2xl">
			{#if activeSubPanel}
				<div class="flex flex-col gap-2">
					{#each activeSubPanel.items as item (item.key)}
						<SchemaItemRenderer {deviceId} {item} {loadingValues} />
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
	{:else if useSchema && !schemaPanel}
		<!-- Schema loaded but no panel for this category (e.g., "toggles" or "other") -->
		<div class="alert border-none bg-[#1e293b] text-slate-300">
			<span>No schema panel found for "{category}". Showing legacy view.</span>
		</div>
		<!-- Fall through to legacy rendering below -->
		{#if categorySettings.length > 0}
			<div class="grid grid-cols-1 gap-4 lg:grid-cols-2 xl:grid-cols-3">
				{#each writableSettings as setting}
					{#if setting.isSection}
						<div class="col-span-full mt-8 mb-2 first:mt-0">
							<div class="flex items-center gap-4">
								{#if setting.label}
									<h3
										class="text-sm font-bold tracking-widest whitespace-nowrap text-slate-500 uppercase"
									>
										{setting.label}
									</h3>
								{/if}
								<div class="h-px w-full bg-slate-800"></div>
							</div>
						</div>
					{:else}
						<SettingCard {deviceId} {setting} {loadingValues} onJsonClick={openJsonModal} />
					{/if}
				{/each}
			</div>
		{/if}
	{:else if categorySettings.length === 0}
		<div class="alert border-none bg-[#1e293b] text-slate-300">
			<span>No settings found for this category.</span>
		</div>
	{:else}
		<!-- ═══ Legacy rendering (no schema available) ═══ -->
		<div class="grid grid-cols-1 gap-4 lg:grid-cols-2 xl:grid-cols-3">
			{#each writableSettings as setting}
				{#if setting.isSection}
					<div class="col-span-full mt-8 mb-2 first:mt-0">
						<div class="flex items-center gap-4">
							{#if setting.label}
								<h3
									class="text-sm font-bold tracking-widest whitespace-nowrap text-slate-500 uppercase"
								>
									{setting.label}
								</h3>
							{/if}
							<div class="h-px w-full bg-slate-800"></div>
						</div>
					</div>
				{:else}
					<SettingCard {deviceId} {setting} {loadingValues} onJsonClick={openJsonModal} />
				{/if}
			{/each}
		</div>

		{#if readonlySettings.length > 0}
			<details class="group mt-8 rounded-xl border border-[#334155] bg-[#101a29] open:bg-[#0f1726]">
				<summary
					class="flex cursor-pointer items-center justify-between p-4 font-medium text-slate-400 hover:text-white"
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
				<div
					class="grid grid-cols-1 gap-4 border-t border-[#334155] p-4 lg:grid-cols-2 xl:grid-cols-3"
				>
					{#each readonlySettings as setting}
						{#if setting.isSection}
							<div class="col-span-full mt-4 mb-2 first:mt-0">
								<div class="flex items-center gap-4">
									{#if setting.label}
										<h3
											class="text-xs font-bold tracking-widest whitespace-nowrap text-slate-500 uppercase"
										>
											{setting.label}
										</h3>
									{/if}
									<div class="h-px w-full bg-slate-800"></div>
								</div>
							</div>
						{:else}
							<SettingCard {deviceId} {setting} {loadingValues} onJsonClick={openJsonModal} />
						{/if}
					{/each}
				</div>
			</details>
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
<DeviceOnlineModal bind:open={deviceOnlineModalOpen} />

<!-- JSON Modal -->
{#if jsonModalOpen}
	<div class="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
		<div class="w-full max-w-3xl rounded-xl border border-[#334155] bg-[#1e293b] p-6 shadow-2xl">
			<div class="mb-4 flex items-center justify-between">
				<h3 class="text-lg font-bold text-white">{jsonModalTitle}</h3>
				<button
					class="btn btn-circle text-slate-400 btn-ghost btn-sm"
					onclick={() => (jsonModalOpen = false)}
				>
					✕
				</button>
			</div>
			<div class="max-h-[60vh] overflow-auto rounded-lg bg-[#0f1726] p-4">
				<div class="flex font-mono text-xs">
					<div class="mr-4 text-right text-slate-600 select-none">
						{#each jsonModalContent.split('\n') as _, i}
							<div>{i + 1}</div>
						{/each}
					</div>
					<pre class="text-slate-300">{@html jsonModalContent}</pre>
				</div>
			</div>
			<div class="mt-6 flex justify-end">
				<button class="btn btn-primary" onclick={() => (jsonModalOpen = false)}>Close</button>
			</div>
		</div>
	</div>
{/if}
