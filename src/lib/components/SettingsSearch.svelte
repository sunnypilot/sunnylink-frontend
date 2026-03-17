<script lang="ts">
	import { Search, X } from 'lucide-svelte';
	import { fade } from 'svelte/transition';
	import { deviceState } from '$lib/stores/device.svelte';
	import { searchState } from '$lib/stores/search.svelte';
	import { getAllSettings } from '$lib/utils/settings';
	import { searchSettings, type SearchResult } from '$lib/utils/search';
	import { goto } from '$app/navigation';
	import { MODEL_SETTINGS } from '$lib/types/settings';

	let isOpen = $state(false);
	let isFocused = $state(false);
	let inputRef: HTMLInputElement;
	let results: SearchResult[] = $state([]);

	let deviceId = $derived(deviceState.selectedDeviceId);
	let settings = $derived(deviceId ? deviceState.deviceSettings[deviceId] : undefined);

	let searchableSettings = $derived(
		getAllSettings(settings, true, false).filter((s) => !s.hidden || MODEL_SETTINGS.includes(s.key))
	);
	let deviceValues = $derived(deviceId ? deviceState.deviceValues[deviceId] : undefined);

	$effect(() => {
		if (searchState.query.trim()) {
			results = searchSettings(searchState.query, searchableSettings, deviceValues);
			if (isFocused) isOpen = true;
		} else {
			results = [];
			isOpen = false;
		}
	});

	function handleSelect(result: SearchResult) {
		isOpen = false;
		isFocused = false;
		inputRef?.blur();
		if (MODEL_SETTINGS.includes(result.setting.key)) {
			goto(`/dashboard/models#${result.setting.key}`);
		} else {
			goto(`/dashboard/settings/${result.setting.category}#${result.setting.key}`);
		}
	}

	function handleKeydown(e: KeyboardEvent) {
		if (e.key === 'Escape') {
			if (isOpen) {
				isOpen = false;
			} else {
				isFocused = false;
				searchState.query = '';
				inputRef?.blur();
			}
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
		}}
	></div>
{/if}

<div class="relative w-full {isFocused ? 'z-50' : ''}">
	<div class="relative">
		<div class="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3">
			<Search class="h-5 w-5 text-[var(--sl-text-2)]" />
		</div>
		<input
			bind:this={inputRef}
			type="text"
			bind:value={searchState.query}
			placeholder="Search settings..."
			class="input-bordered input w-full bg-[var(--sl-bg-elevated)] pr-10 pl-10 text-sm text-[var(--sl-text-1)] placeholder-[var(--sl-text-2)] focus:border-primary focus:outline-none"
			onfocus={() => {
				isFocused = true;
				if (searchState.query.trim()) isOpen = true;
			}}
		/>
		{#if searchState.query}
			<button
				class="absolute inset-y-0 right-0 flex items-center pr-3 text-[var(--sl-text-2)] hover:text-[var(--sl-text-1)]"
				onclick={() => {
					searchState.query = '';
					results = [];
					isOpen = false;
					isFocused = false;
				}}
			>
				<X class="h-5 w-5" />
			</button>
		{/if}
	</div>

	{#if isOpen && results.length > 0}
		<div
			class="search-results absolute z-50 mt-2 max-h-96 w-full overflow-y-auto rounded-xl border border-[var(--sl-border)] bg-[var(--sl-bg-elevated)] shadow-2xl"
		>
			{#each results as result}
				<button
					class="flex w-full flex-col border-b border-[var(--sl-border)] px-4 py-3 text-left transition-colors last:border-0 hover:bg-[var(--sl-bg-input)]"
					onclick={() => handleSelect(result)}
				>
					<span class="flex items-center justify-between">
						<span class="font-medium text-[var(--sl-text-1)]"
							>{result.setting._extra?.title || result.setting.label}</span
						>
						<span class="text-sm text-[var(--sl-text-3)] capitalize">
							{MODEL_SETTINGS.includes(result.setting.key) ? 'models' : result.setting.category}
						</span>
					</span>
					{#if result.setting.key !== (result.setting._extra?.title || result.setting.label)}
						<span class="font-mono text-sm text-[var(--sl-text-3)]">{result.setting.key}</span>
					{/if}
					<p class="mt-1 line-clamp-2 text-sm text-[var(--sl-text-2)]">
						{result.setting._extra?.description || result.setting.description}
					</p>
				</button>
			{/each}
		</div>
	{:else if isOpen && searchState.query.trim()}
		<div
			class="search-results absolute z-50 mt-2 w-full rounded-xl border border-[var(--sl-border)] bg-[var(--sl-bg-elevated)] p-4 text-center text-sm text-[var(--sl-text-2)] shadow-2xl"
		>
			No settings found.
		</div>
	{/if}
</div>
