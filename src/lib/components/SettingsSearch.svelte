<script lang="ts">
	import { Search } from 'lucide-svelte';
	import { fade } from 'svelte/transition';
	import { deviceState } from '$lib/stores/device.svelte';
	import { searchState } from '$lib/stores/search.svelte';
	import { preferences } from '$lib/stores/preferences.svelte';
	import { getAllSettings } from '$lib/utils/settings';
	import { searchSettings, type SearchResult } from '$lib/utils/search';
	import { goto } from '$app/navigation';

	let query = $state('');
	let isOpen = $state(false);
	let isFocused = $state(false);
	let inputRef: HTMLInputElement;
	let results: SearchResult[] = $state([]);

	let deviceId = $derived(deviceState.selectedDeviceId);
	let settings = $derived(deviceId ? deviceState.deviceSettings[deviceId] : undefined);

	// Get all settings using the shared utility
	let allSettings = $derived(getAllSettings(settings, true)); // Always search advanced settings? Or respect preference?
	// Always search advanced settings? Or respect preference?
	// Let's respect preference for now, but maybe search should find everything?
	// The user requirement didn't specify, but usually search finds hidden things too.
	// But getAllSettings filters by showAdvanced. Let's pass true to search everything if we want,
	// or pass preferences.showAdvanced.
	// Let's stick to what the user can see for now to avoid confusion, or maybe show them but indicate they are advanced?
	// For now, let's just use the utility as is, which filters based on the 2nd arg.
	// Actually, I'll pass `true` to getAllSettings to get EVERYTHING, and then maybe filter or show badges in the UI.
	// Wait, getAllSettings takes `showAdvanced`. If I pass true, I get advanced settings.
	// If I want to search *everything* even if hidden, I might need to adjust getAllSettings or just pass true.
	// Let's pass `true` so search is powerful.

	let searchableSettings = $derived(getAllSettings(settings, true));
	let deviceValues = $derived(deviceId ? deviceState.deviceValues[deviceId] : undefined);

	$effect(() => {
		if (searchState.query.trim()) {
			results = searchSettings(searchState.query, searchableSettings, deviceValues);
			isOpen = true;
		} else {
			results = [];
			isOpen = false;
		}
	});

	function handleSelect(result: SearchResult) {
		// Do NOT clear query, so the page can filter
		isOpen = false;
		isFocused = false;
		// Navigate to the setting
		// We need to know the route. It's /dashboard/settings/[category]
		// And we can add a hash to scroll to it.
		goto(`/dashboard/settings/${result.setting.category}#${result.setting.key}`);
	}

	function handleKeydown(e: KeyboardEvent) {
		if (e.key === 'Escape') {
			isOpen = false;
			isFocused = false;
			searchState.query = '';
			inputRef?.blur();
		}
	}

	// Close on click outside
	function handleClickOutside(event: MouseEvent) {
		if (
			isOpen &&
			inputRef &&
			!inputRef.contains(event.target as Node) &&
			!(event.target as Element).closest('.search-results')
		) {
			isOpen = false;
			isFocused = false;
			searchState.query = '';
		}
	}
</script>

<svelte:window onclick={handleClickOutside} onkeydown={handleKeydown} />

{#if isFocused}
	<!-- svelte-ignore a11y_click_events_have_key_events -->
	<div
		transition:fade={{ duration: 200 }}
		class="fixed inset-0 z-40 bg-black/50 backdrop-blur-sm"
		role="presentation"
		onclick={() => {
			isFocused = false;
			isOpen = false;
			searchState.query = '';
		}}
	></div>
{/if}

<div class="relative w-full max-w-md {isFocused ? 'z-50' : ''}">
	<div class="relative">
		<div class="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3">
			<Search class="h-5 w-5 text-slate-400" />
		</div>
		<input
			bind:this={inputRef}
			type="text"
			bind:value={searchState.query}
			placeholder="Search settings..."
			class="input-bordered input w-full bg-[#1e293b] pl-10 text-sm text-white placeholder-slate-400 focus:border-primary focus:outline-none"
			onfocus={() => {
				isFocused = true;
				if (searchState.query.trim()) isOpen = true;
			}}
		/>
	</div>

	{#if isOpen && results.length > 0}
		<div
			class="search-results absolute z-50 mt-2 max-h-96 w-full overflow-y-auto rounded-xl border border-[#334155] bg-[#1e293b] shadow-2xl"
		>
			{#each results as result}
				<button
					class="flex w-full flex-col border-b border-[#334155] px-4 py-3 text-left transition-colors last:border-0 hover:bg-[#0f1726]"
					onclick={() => handleSelect(result)}
				>
					<span class="flex items-center justify-between">
						<span class="font-medium text-white"
							>{result.setting._extra?.title || result.setting.label}</span
						>
						<span class="text-xs text-slate-500 capitalize">{result.setting.category}</span>
					</span>
					{#if result.setting.key !== (result.setting._extra?.title || result.setting.label)}
						<span class="font-mono text-xs text-slate-500">{result.setting.key}</span>
					{/if}
					<p class="mt-1 line-clamp-2 text-xs text-slate-400">
						{result.setting._extra?.description || result.setting.description}
					</p>
				</button>
			{/each}
		</div>
	{:else if isOpen && searchState.query.trim()}
		<div
			class="search-results absolute z-50 mt-2 w-full rounded-xl border border-[#334155] bg-[#1e293b] p-4 text-center text-sm text-slate-400 shadow-2xl"
		>
			No settings found.
		</div>
	{/if}
</div>
