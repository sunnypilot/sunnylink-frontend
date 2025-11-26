<script lang="ts">
	import { page } from '$app/state';
	import { deviceState } from '$lib/stores/device.svelte';
	import { preferences } from '$lib/stores/preferences.svelte';
	import { SETTINGS_DEFINITIONS, type SettingCategory } from '$lib/types/settings';
	import { checkDeviceStatus } from '$lib/api/device';
	import { logtoClient } from '$lib/logto/auth.svelte';
	import { decodeParamValue } from '$lib/utils/device';
	import DeviceSelector from '$lib/components/DeviceSelector.svelte';

	let { data } = $props();

	let category = $derived(page.params.category as SettingCategory);
	let deviceId = $derived(deviceState.selectedDeviceId);
	let settings = $derived(deviceId ? deviceState.deviceSettings[deviceId] : undefined);

	let categorySettings = $derived.by(() => {
		// 1. Get explicit definitions for this category
		const explicitDefs = SETTINGS_DEFINITIONS.filter((def) => def.category === category);

		// 2. If category is 'other', also find dynamic settings from device
		let dynamicDefs: any[] = [];
		if (category === 'other' && settings) {
			const definedKeys = new Set(SETTINGS_DEFINITIONS.map((d) => d.key));
			dynamicDefs = settings
				.filter((s) => s.key && !definedKeys.has(s.key))
				.map((s) => {
					let decodedValue = s;
					if (s.default_value) {
						try {
							decodedValue = { ...s };
							decodedValue.default_value = atob(s.default_value);
						} catch (e) {
							console.warn(`Failed to decode default value for ${s.key}`, e);
						}
					}
					return {
						key: s.key!,
						label: s.key!,
						description: 'Unknown setting from device',
						category: 'other' as SettingCategory,
						value: decodedValue,
						advanced: false,
						readonly: false,
						hidden: false
					};
				});
		}

		// 3. Combine and map values
		const allDefs = [...explicitDefs, ...dynamicDefs];

		return (
			allDefs
				.map((def) => {
					const settingValue = settings?.find((s) => s.key === def.key);
					let decodedValue = settingValue;

					// Decode default value if present (and not already decoded for dynamic ones)
					// Dynamic ones are already decoded above, but explicit ones need it here.
					// Actually, for dynamic ones, we constructed a 'def' that has 'value' already set.
					// For explicit ones, 'def' is just the definition.

					// Let's normalize.
					if (settingValue?.default_value) {
						try {
							decodedValue = { ...settingValue };
							decodedValue.default_value = atob(settingValue.default_value);
						} catch (e) {
							console.warn(`Failed to decode default value for ${def.key}`, e);
						}
					} else if ((def as any).value) {
						// It's a dynamic def we just created, use its value
						decodedValue = (def as any).value;
					}

					return {
						...def,
						value: decodedValue
					};
				})
				// Filter out those that have no value AND no default value?
				// The original logic filtered `s.value !== undefined`.
				// For explicit settings, `decodedValue` might be undefined if not on device.
				// But we usually want to show them if they are in definitions?
				// Original logic: `.filter((s) => s.value !== undefined)`
				// This implies we ONLY show settings that exist on the device (or have a default value loaded).
				// If `settings` is undefined (device not loaded), `decodedValue` is undefined.
				// So we probably want to keep this filter to avoid showing empty cards before data loads?
				// Or maybe we want to show them as "loading"?
				// The original code had `if (!settings) return []`, so it waited for settings.
				// Here `settings` is derived from deviceState.

				// If we want to show explicit settings even if not on device yet (e.g. to show they exist),
				// we might want to relax this. But for now, let's stick to original behavior:
				// show if we have a value (from device or default).
				.filter((s) => s.value !== undefined)
				.filter((s) => !s.hidden)
				.filter((s) => preferences.showAdvanced || !s.advanced)
		);
	});

	let writableSettings = $derived(categorySettings.filter((s) => !s.readonly));
	let readonlySettings = $derived(categorySettings.filter((s) => s.readonly));

	import { v1Client } from '$lib/api/client';

	let loadingValues = $state(false);
	let loadingProgress = $state('');
	let jsonModalOpen = $state(false);
	let jsonModalContent = $state('');
	let jsonModalTitle = $state('');

	$effect(() => {
		if (deviceId && logtoClient && categorySettings.length > 0) {
			fetchCurrentValues();
		}
	});

	function chunkArray<T>(array: T[], size: number): T[][] {
		const result = [];
		for (let i = 0; i < array.length; i += size) {
			result.push(array.slice(i, i + size));
		}
		return result;
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
					const response = await v1Client.GET('/v1/settings/{deviceId}/values', {
						params: {
							path: { deviceId },
							query: { paramKeys: chunk }
						},
						headers: {
							Authorization: `Bearer ${token}`
						}
					});

					if (response.data?.items) {
						// Initialize device values map if not exists
						if (!deviceState.deviceValues[deviceId]) {
							deviceState.deviceValues[deviceId] = {};
						}

						// Update store with fetched values
						for (const item of response.data.items) {
							if (item.key && item.value !== undefined) {
								// Find definition to get the type
								const def = categorySettings.find((s) => s.key === item.key);
								const type = def?.value?.type ?? 'String'; // Default to String if unknown

								// Decode the value
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

	function syntaxHighlightJson(json: string): string {
		if (!json) return '';
		json = json.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
		return json.replace(
			/("(\\u[a-zA-Z0-9]{4}|\\[^u]|[^\\"])*"(\s*:)?|\b(true|false|null)\b|-?\d+(?:\.\d*)?(?:[eE][+\-]?\d+)?)/g,
			function (match) {
				let cls = 'text-orange-400'; // number
				if (/^"/.test(match)) {
					if (/:$/.test(match)) {
						cls = 'text-blue-400'; // key
					} else {
						cls = 'text-green-400'; // string
					}
				} else if (/true|false/.test(match)) {
					cls = 'text-purple-400'; // boolean
				} else if (/null/.test(match)) {
					cls = 'text-gray-400'; // null
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

<div class="space-y-6">
	<div class="flex items-center justify-between">
		<div>
			<h2 class="text-2xl font-bold text-white capitalize">
				{category} Settings
				{#if loadingValues}
					<span class="ml-2 text-sm font-normal text-slate-400">{loadingProgress}</span>
				{/if}
			</h2>
			<p class="text-slate-400">
				{#if deviceId}
					Configuring {deviceId}
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
			{@const selectedDevice = devices?.find((d: any) => d.device_id === deviceId)}
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
				<div class="mt-6">
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
					<div class="divider text-slate-600">OR</div>
					<p class="text-sm text-slate-400">Select another device:</p>
					{#if devices}
						<DeviceSelector {devices} />
					{/if}
				</div>
			</div>
		{/await}
	{:else if !settings}
		<div class="flex justify-center p-12">
			<span class="loading loading-lg loading-spinner text-primary"></span>
		</div>
	{:else if categorySettings.length === 0}
		<div class="alert border-none bg-[#1e293b] text-slate-300">
			<span>No settings found for this category.</span>
		</div>
	{:else}
		{#snippet settingCard(setting: any)}
			{@const currentValue = deviceState.deviceValues[deviceId]?.[setting.key]}
			{@const displayValue =
				currentValue !== undefined ? currentValue : setting.value?.default_value}
			{@const isBool = setting.value?.type === 'Bool'}
			{@const isJson = setting.value?.type === 'Json'}
			{@const isString = setting.value?.type === 'String'}
			{@const isLoading = loadingValues && currentValue === undefined}

			{#if isBool}
				<button
					class="flex w-full cursor-default flex-col justify-between rounded-xl border border-[#334155] bg-[#101a29] p-4 text-left transition-all duration-200 sm:p-6"
					class:opacity-50={setting.readonly}
					class:cursor-not-allowed={setting.readonly}
					disabled={setting.readonly}
					aria-pressed={displayValue === true}
					aria-disabled={setting.readonly}
					tabindex={setting.readonly ? -1 : 0}
				>
					<div class="mb-4 w-full">
						<div class="flex items-start justify-between">
							<h3 class="font-medium break-all text-white">
								{preferences.debugMode ? setting.key : setting.label}
								{#if setting.readonly}
									<span
										class="ml-2 rounded bg-amber-500/20 px-1.5 py-0.5 text-[0.6rem] font-bold tracking-wider text-amber-500 uppercase"
									>
										RO
									</span>
								{/if}
							</h3>
							<span class="text-xs font-bold tracking-wider text-slate-500 uppercase">
								{#if displayValue === true}
									Enabled
								{:else}
									Disabled
								{/if}
							</span>
						</div>
						<p class="mt-1 text-sm text-slate-400">{setting.description}</p>
						{#if setting.value?.default_value && !isLoading}
							<p class="mt-2 text-xs text-slate-500">
								Default: {setting.value.default_value}
							</p>
						{/if}
					</div>

					<div class="mt-auto flex w-full items-end justify-end">
						{#if isLoading}
							<div class="h-8 w-full animate-pulse rounded bg-slate-700"></div>
						{:else}
							<div
								class="relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors"
								class:bg-primary={displayValue === true}
								class:bg-slate-700={displayValue !== true}
							>
								<span
									class="inline-block h-4 w-4 transform rounded-full bg-white transition-transform"
									class:translate-x-6={displayValue === true}
									class:translate-x-1={displayValue !== true}
								></span>
							</div>
						{/if}
					</div>
				</button>
			{:else}
				<div
					class="flex flex-col justify-between rounded-xl border border-[#334155] bg-[#101a29] p-4 transition-colors hover:border-primary/50 sm:p-6"
				>
					<div class="mb-4">
						<div class="flex items-start justify-between">
							<h3 class="font-medium break-all text-white">
								{preferences.debugMode ? setting.key : setting.label}
								{#if setting.readonly}
									<span
										class="ml-2 rounded bg-amber-500/20 px-1.5 py-0.5 text-[0.6rem] font-bold tracking-wider text-amber-500 uppercase"
									>
										RO
									</span>
								{/if}
							</h3>
						</div>
						<p class="mt-1 text-sm text-slate-400">{setting.description}</p>
						{#if setting.value?.default_value && !isLoading}
							<p class="mt-2 text-xs text-slate-500">
								Default: {isJson
									? '(JSON)'
									: String(setting.value.default_value).length > 50
										? String(setting.value.default_value).slice(0, 50) + '...'
										: setting.value.default_value}
							</p>
						{/if}
					</div>

					<div class="mt-auto flex items-end justify-end">
						{#if isLoading}
							<div class="h-8 w-full animate-pulse rounded bg-slate-700"></div>
						{:else if isJson}
							<button
								class="btn w-full text-slate-300 btn-outline btn-sm hover:border-primary hover:text-primary"
								onclick={() => openJsonModal(setting.label, displayValue)}
							>
								View JSON
							</button>
						{:else if isString && String(displayValue).length > 50}
							<div
								class="max-h-32 w-full overflow-y-auto rounded bg-[#0f1726] p-2 text-xs whitespace-pre-wrap text-slate-300"
							>
								{displayValue}
							</div>
						{:else}
							<div
								class="w-full rounded bg-[#0f1726] p-2 text-center text-sm font-medium text-white"
							>
								{displayValue !== undefined ? String(displayValue) : '-'}
							</div>
						{/if}
					</div>
				</div>
			{/if}
		{/snippet}

		<div class="grid grid-cols-1 gap-4 lg:grid-cols-2 xl:grid-cols-3">
			{#each writableSettings as setting}
				{@render settingCard(setting)}
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
						{@render settingCard(setting)}
					{/each}
				</div>
			</details>
		{/if}
	{/if}
</div>

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
					<!-- Line Numbers -->
					<div class="mr-4 text-right text-slate-600 select-none">
						{#each jsonModalContent.split('\n') as _, i}
							<div>{i + 1}</div>
						{/each}
					</div>
					<!-- Code -->
					<pre class="text-slate-300">{@html jsonModalContent}</pre>
				</div>
			</div>
			<div class="mt-6 flex justify-end">
				<button class="btn btn-primary" onclick={() => (jsonModalOpen = false)}>Close</button>
			</div>
		</div>
	</div>
{/if}
```
