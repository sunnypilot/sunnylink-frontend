<script lang="ts">
	import { page } from '$app/state';
	import { goto } from '$app/navigation';
	import { deviceState } from '$lib/stores/device.svelte';
	import { preferences } from '$lib/stores/preferences.svelte';
	import { searchState } from '$lib/stores/search.svelte';
	import { toastState } from '$lib/stores/toast.svelte';
	import {
		SETTINGS_DEFINITIONS,
		type SettingCategory,
		type RenderableSetting
	} from '$lib/types/settings';
	import { checkDeviceStatus } from '$lib/api/device';
	import { logtoClient } from '$lib/logto/auth.svelte';
	import { decodeParamValue } from '$lib/utils/device';
	import { getAllSettings } from '$lib/utils/settings';
	import { searchSettings } from '$lib/utils/search';

	import DeviceSelector from '$lib/components/DeviceSelector.svelte';
	import SettingsActionBar from '$lib/components/SettingsActionBar.svelte';
	import PushSettingsModal from '$lib/components/PushSettingsModal.svelte';
	import DeviceOnlineModal from '$lib/components/DeviceOnlineModal.svelte';

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

	// Derived alias for current device
	let currentDeviceAlias = $derived.by(() => {
		if (!deviceId) return undefined;
		const device = devices.find((d) => d.device_id === deviceId);
		return deviceState.aliases[deviceId] ?? device?.alias ?? deviceId;
	});

	let categorySettings = $derived.by(() => {
		const all = getAllSettings(settings, preferences.showAdvanced).filter(
			(s) => s.category === category
		);
		if (!searchState.query.trim()) return all;

		// Filter by search query
		const results = searchSettings(searchState.query, all, deviceValues);
		return results.map((r) => r.setting);
	});

	let writableSettings = $derived(categorySettings.filter((s) => !s.readonly));
	let readonlySettings = $derived(categorySettings.filter((s) => s.readonly));

	import { v1Client } from '$lib/api/client';

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

	$effect(() => {
		if (deviceId && logtoClient && categorySettings.length > 0) {
			fetchCurrentValues();
		}
	});

	$effect(() => {
		if (page.url.searchParams.get('openPush') === 'true') {
			pushModalOpen = true;
			// Optional: Clean up URL
			const newUrl = new URL(page.url);
			newUrl.searchParams.delete('openPush');
			goto(newUrl.toString(), { replaceState: true, keepFocus: true, noScroll: true });
		}
	});

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

			// Build lookup map for O(1) access to setting types
			const settingsTypeMap = new Map<string, string>();
			for (const setting of categorySettings) {
				settingsTypeMap.set(setting.key, setting.value?.type ?? 'String');
			}

			// Process keys in chunks of 10
			const chunkSize = 10;
			for (let i = 0; i < keysToFetch.length; i += chunkSize) {
				const chunk = keysToFetch.slice(i, i + chunkSize);

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
								const type = settingsTypeMap.get(item.key) ?? 'String';

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
		// Escape HTML entities once
		const escaped = json.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
		
		// Pre-compile regex patterns for better performance (these are constants)
		const tokenRegex = /("(\\u[a-zA-Z0-9]{4}|\\[^u]|[^\\"])*"(\s*:)?|\b(true|false|null)\b|-?\d+(?:\.\d*)?(?:[eE][+\-]?\d+)?)/g;
		
		return escaped.replace(tokenRegex, (match) => {
			let cls = 'text-orange-400'; // number
			const firstChar = match[0];
			if (firstChar === '"') {
				cls = match[match.length - 1] === ':' ? 'text-blue-400' : 'text-green-400';
			} else if (match === 'true' || match === 'false') {
				cls = 'text-purple-400';
			} else if (match === 'null') {
				cls = 'text-gray-400';
			}
			return `<span class="${cls}">${match}</span>`;
		});
	}

	function openJsonModal(title: string, content: any) {
		jsonModalTitle = title;
		const formatted = JSON.stringify(content, null, 2);
		jsonModalContent = syntaxHighlightJson(formatted);
		jsonModalOpen = true;
	}
</script>

<div class="space-y-6" class:pb-16={hasChanges}>
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
					<div class="divider text-xs tracking-widest text-slate-600">OR SELECT ANOTHER DEVICE</div>
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
		{#snippet settingCard(setting: RenderableSetting)}
			{@const currentValue = deviceState.deviceValues[deviceId]?.[setting.key]}
			{@const stagedValue = deviceState.getChange(deviceId, setting.key)}
			{@const hasStaged = stagedValue !== undefined}
			{@const displayValue = hasStaged
				? stagedValue
				: currentValue !== undefined
					? currentValue
					: setting.value?.default_value}
			{@const isBool = setting.value?.type === 'Bool'}
			{@const isJson = setting.value?.type === 'Json'}
			{@const isString = setting.value?.type === 'String'}
			{@const isNumber = setting.value?.type === 'Int' || setting.value?.type === 'Float'}
			{@const isLoading = loadingValues && currentValue === undefined}

			{@const title =
				setting._extra?.title || (preferences.debugMode ? setting.key : setting.label)}
			{@const description = setting._extra?.description || setting.description}
			{@const options = setting._extra?.options}
			{@const min = setting._extra?.min}
			{@const max = setting._extra?.max}
			{@const step = setting._extra?.step}

			{#if isBool}
				<button
					class="flex w-full cursor-default flex-col justify-between rounded-xl border bg-[#101a29] p-4 text-left transition-all duration-200 sm:p-6"
					class:border-primary={hasStaged}
					class:border-[#334155]={!hasStaged}
					class:opacity-50={setting.readonly}
					class:cursor-not-allowed={setting.readonly}
					disabled={setting.readonly}
					id={setting.key}
					aria-pressed={displayValue === true}
					aria-disabled={setting.readonly}
					tabindex={setting.readonly ? -1 : 0}
					onclick={() => {
						if (!setting.readonly) {
							const newValue = !displayValue;
							// Use currentValue as original, or default if undefined.
							// For booleans, undefined should be treated as false for the original value check
							// to avoid "undefined -> true" showing as a change if it was effectively false (off).
							let original =
								currentValue !== undefined ? currentValue : setting.value?.default_value;

							if (isBool && original === undefined) {
								original = false;
							}

							deviceState.stageChange(deviceId, setting.key, newValue, original);
						}
					}}
				>
					<span class="mb-4 w-full">
						<span class="flex items-start justify-between">
							<h3 class="font-medium break-all text-white">
								{title}
								{#if setting.readonly}
									<span
										class="ml-2 rounded bg-amber-500/20 px-1.5 py-0.5 text-[0.6rem] font-bold tracking-wider text-amber-500 uppercase"
									>
										RO
									</span>
								{/if}
								{#if hasStaged}
									<span
										class="ml-2 rounded bg-primary/20 px-1.5 py-0.5 text-[0.6rem] font-bold tracking-wider text-primary uppercase"
									>
										Modified
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
						</span>
						<p class="mt-1 text-sm text-slate-400">{description}</p>
						{#if setting.value?.default_value !== undefined && setting.value?.default_value !== null && !isLoading}
							<p class="mt-2 text-xs text-slate-500">
								Default: {options
									? options.find((o) => String(o.value) === String(setting.value?.default_value))
											?.label || setting.value.default_value
									: setting.value.default_value}
							</p>
						{/if}
					</span>

					<span class="mt-auto flex w-full items-end justify-end">
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
					</span>
				</button>
			{:else}
				<div
					class="flex flex-col justify-between rounded-xl border bg-[#101a29] p-4 transition-colors hover:border-primary/50 sm:p-6"
					class:border-primary={hasStaged}
					class:border-[#334155]={!hasStaged}
					id={setting.key}
				>
					<div class="mb-4">
						<div class="flex items-start justify-between">
							<h3 class="font-medium break-all text-white">
								{title}
								{#if setting.readonly}
									<span
										class="ml-2 rounded bg-amber-500/20 px-1.5 py-0.5 text-[0.6rem] font-bold tracking-wider text-amber-500 uppercase"
									>
										RO
									</span>
								{/if}
								{#if hasStaged}
									<span
										class="ml-2 rounded bg-primary/20 px-1.5 py-0.5 text-[0.6rem] font-bold tracking-wider text-primary uppercase"
									>
										Modified
									</span>
								{/if}
							</h3>
						</div>
						<p class="mt-1 text-sm text-slate-400">{description}</p>
						{#if setting.value?.default_value !== undefined && setting.value?.default_value !== null && !isLoading}
							<p class="mt-2 text-xs text-slate-500">
								Default: {options
									? options.find((o) => String(o.value) === String(setting.value?.default_value))
											?.label || setting.value.default_value
									: isJson
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
						{:else if options}
							<select
								class="select w-full bg-[#0f1726] select-sm text-white focus:border-primary focus:outline-none"
								value={displayValue}
								onchange={(e: Event & { currentTarget: HTMLSelectElement }) => {
									const val = e.currentTarget.value;
									let newValue: string | number = val;
									// Try to convert to number if the original type is Int/Float
									if (setting.value?.type === 'Int') newValue = parseInt(val, 10);
									if (setting.value?.type === 'Float') newValue = parseFloat(val);

									const original =
										currentValue !== undefined ? currentValue : setting.value?.default_value;
									deviceState.stageChange(deviceId, setting.key, newValue, original);
								}}
							>
								{#each options as option}
									<option value={option.value}>{option.label}</option>
								{/each}
							</select>
						{:else if isJson}
							<button
								class="btn w-full text-slate-300 btn-outline btn-sm hover:border-primary hover:text-primary"
								onclick={() => openJsonModal(setting.label, displayValue)}
							>
								View JSON
							</button>
						{:else if !setting.readonly && (isString || isNumber)}
							{#if isNumber && min !== undefined && max !== undefined}
								<div class="flex w-full flex-col gap-2">
									<div class="flex items-center justify-between">
										<span class="text-xs font-medium text-slate-400">{min}</span>
										<span class="text-lg font-bold text-primary">
											{displayValue !== undefined
												? displayValue
												: setting.value?.default_value || min}
										</span>
										<span class="text-xs font-medium text-slate-400">{max}</span>
									</div>
									<div class="flex items-center gap-4">
										<button
											class="btn btn-circle text-slate-400 btn-ghost btn-sm hover:text-white"
											aria-label="Decrease value"
											onclick={() => {
												let current =
													displayValue !== undefined
														? Number(displayValue)
														: Number(setting.value?.default_value || min);
												let newValue = Math.max(min, current - (step || 1));
												const original =
													currentValue !== undefined ? currentValue : setting.value?.default_value;
												deviceState.stageChange(deviceId, setting.key, newValue, original);
											}}
										>
											<svg
												xmlns="http://www.w3.org/2000/svg"
												width="20"
												height="20"
												viewBox="0 0 24 24"
												fill="none"
												stroke="currentColor"
												stroke-width="2"
												stroke-linecap="round"
												stroke-linejoin="round"><path d="M5 12h14" /></svg
											>
										</button>
										<input
											type="range"
											{min}
											{max}
											step={step || 1}
											value={displayValue !== undefined
												? displayValue
												: setting.value?.default_value || min}
											class="range flex-1 range-primary range-xs"
											oninput={(e: Event & { currentTarget: HTMLInputElement }) => {
												const val = e.currentTarget.value;
												let newValue: string | number = val;
												if (setting.value?.type === 'Int') newValue = parseInt(val, 10);
												if (setting.value?.type === 'Float') newValue = parseFloat(val);

												const original =
													currentValue !== undefined ? currentValue : setting.value?.default_value;
												deviceState.stageChange(deviceId, setting.key, newValue, original);
											}}
										/>
										<button
											class="btn btn-circle text-slate-400 btn-ghost btn-sm hover:text-white"
											aria-label="Increase value"
											onclick={() => {
												let current =
													displayValue !== undefined
														? Number(displayValue)
														: Number(setting.value?.default_value || min);
												let newValue = Math.min(max, current + (step || 1));
												const original =
													currentValue !== undefined ? currentValue : setting.value?.default_value;
												deviceState.stageChange(deviceId, setting.key, newValue, original);
											}}
										>
											<svg
												xmlns="http://www.w3.org/2000/svg"
												width="20"
												height="20"
												viewBox="0 0 24 24"
												fill="none"
												stroke="currentColor"
												stroke-width="2"
												stroke-linecap="round"
												stroke-linejoin="round"><path d="M5 12h14" /><path d="M12 5v14" /></svg
											>
										</button>
									</div>
								</div>
							{:else}
								<input
									type={isNumber ? 'number' : 'text'}
									value={displayValue !== undefined ? displayValue : ''}
									class="input input-sm w-full bg-[#0f1726] text-white focus:border-primary focus:outline-none"
									placeholder={setting.value?.default_value
										? String(setting.value.default_value)
										: ''}
									{min}
									{max}
									{step}
									oninput={(e: Event & { currentTarget: HTMLInputElement }) => {
										const val = e.currentTarget.value;
										let newValue: string | number = val;
										if (setting.value?.type === 'Int') newValue = parseInt(val, 10);
										if (setting.value?.type === 'Float') newValue = parseFloat(val);

										const original =
											currentValue !== undefined ? currentValue : setting.value?.default_value;
										deviceState.stageChange(deviceId, setting.key, newValue, original);
									}}
								/>
							{/if}
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

<SettingsActionBar
	onPush={() => (pushModalOpen = true)}
	onReset={() => deviceId && deviceState.clearChanges(deviceId)}
/>

<PushSettingsModal
	bind:open={pushModalOpen}
	onPushSuccess={() => {
		// Refresh values
		fetchCurrentValues();
		toastState.show('Settings pushed successfully!', 'success');
	}}
	alias={currentDeviceAlias}
/>
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
