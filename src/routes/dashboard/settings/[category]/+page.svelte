<script lang="ts">
	import { page } from '$app/state';
	import { deviceState } from '$lib/stores/device.svelte';
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
		if (!settings) return [];

		if (category === 'other') {
			// Find settings that are NOT in SETTINGS_DEFINITIONS
			const definedKeys = new Set(SETTINGS_DEFINITIONS.map((d) => d.key));
			return settings
				.filter((s) => s.key && !definedKeys.has(s.key))
				.map((s) => {
					let decodedValue = s;
					if (s.default_value) {
						try {
							decodedValue = { ...s };
							// For 'other', we need to decode based on its type if available
							// Assuming s.type is available on the device param
							decodedValue.default_value = atob(s.default_value);
						} catch (e) {
							console.warn(`Failed to decode default value for ${s.key}`, e);
						}
					}
					return {
						key: s.key!,
						label: s.key!,
						description: 'Unknown setting',
						category: 'other' as SettingCategory,
						value: decodedValue
					};
				});
		}

		// Find settings that match the current category
		return SETTINGS_DEFINITIONS.filter((def) => def.category === category)
			.map((def) => {
				const settingValue = settings?.find((s) => s.key === def.key);
				let decodedValue = settingValue;

				// Decode default value if present
				if (settingValue?.default_value) {
					try {
						// Create a shallow copy to avoid mutating the store and ensure reactivity
						decodedValue = { ...settingValue };
						// Check if it looks like base64 (simple check)
						// Or just try to decode it. The user said "default values were always base64 encoded".
						// We can use atob() for browser environment.
						decodedValue.default_value = atob(settingValue.default_value);
					} catch (e) {
						// If it fails, it might not be base64 or invalid. Keep original.
						console.warn(`Failed to decode default value for ${def.key}`, e);
					}
				}
				return {
					...def,
					value: decodedValue
				};
			})
			.filter((s) => s.value !== undefined); // Only show settings that exist on the device? Or show all defined ones?
		// User said: "if a setting is not listed, it probably should go to a new category... so that it is still tweakable"
		// This implies we should show what is available on the device.
		// But for defined settings, maybe we want to show them even if not returned?
		// The prompt says: "Gets all the available settings on the device... giving us the name of the param... we should store that in memory because the available settings for each device may be different."
		// So we should probably only show settings that are actually returned by the API.
	});
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
		<div class="grid grid-cols-1 gap-4 lg:grid-cols-2 xl:grid-cols-3">
			{#each categorySettings as setting}
				{@const currentValue = deviceState.deviceValues[deviceId]?.[setting.key]}
				{@const displayValue =
					currentValue !== undefined ? currentValue : setting.value?.default_value}
				{@const isBool = setting.value?.type === 'Bool'}
				{@const isJson = setting.value?.type === 'Json'}
				{@const isString = setting.value?.type === 'String'}
				{@const isLoading = loadingValues && currentValue === undefined}

				{#if isBool}
					<button
						class="flex w-full flex-col justify-between rounded-xl border border-[#334155] bg-[#101a29] p-4 text-left transition-all duration-200 hover:border-primary/50 focus:ring-2 focus:ring-primary focus:ring-offset-2 focus:ring-offset-[#101a29] focus:outline-none sm:p-6"
						onclick={() => {
							// Toggle the value
							const newValue = !displayValue;
							// Optimistic update
							if (!deviceState.deviceValues[deviceId]) {
								deviceState.deviceValues[deviceId] = {};
							}
							deviceState.deviceValues[deviceId][setting.key] = newValue;
							// It didn't have an onclick handler! It seems it was just display.
							// I should probably add the logic to actually update it if I can, or at least keep it consistent.
							// Since I am refactoring the UI, I should make it functional if possible, but the prompt didn't explicitly ask for backend wiring if it wasn't there.
							// However, a toggle that doesn't toggle is bad.
							// The user said "acts as the toggle".
							// I will assume for now I should just toggle the local state or call a function if one existed.
							// Looking at the imports, there is no update function imported.
							// I will add a placeholder comment or just toggle the local state for visual feedback as requested.
						}}
						aria-pressed={displayValue === true}
					>
						<div class="mb-4 w-full">
							<div class="flex items-start justify-between">
								<h3 class="font-medium break-all text-white">{setting.label}</h3>
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
								<h3 class="font-medium break-all text-white">{setting.label}</h3>
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
			{/each}
		</div>
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
