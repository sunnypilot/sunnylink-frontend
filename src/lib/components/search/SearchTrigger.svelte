<script lang="ts">
	import { Search } from 'lucide-svelte';
	import { searchState } from '$lib/stores/search.svelte';

	let isMac = $state(false);
	if (typeof navigator !== 'undefined') {
		isMac = /mac|iphone|ipad|ipod/i.test(navigator.platform || navigator.userAgent);
	}
</script>

<button
	class="flex w-full items-center gap-2.5 rounded-lg border border-[var(--sl-border)] bg-[var(--sl-bg-surface)] px-3.5 py-2 text-left text-[0.8125rem] text-[var(--sl-text-3)] transition-all duration-100 hover:border-[var(--sl-text-2)] hover:text-[var(--sl-text-2)] active:scale-[0.96] active:bg-[var(--sl-bg-elevated)]"
	aria-label="Open search (press Cmd+K or Ctrl+K)"
	onclick={() => searchState.open()}
>
	<Search class="h-4 w-4 shrink-0" aria-hidden="true" />
	<span class="min-w-0 flex-1 truncate">
		{searchState.query || 'Search settings…'}
	</span>
	<span class="hidden items-center gap-1 text-[0.6875rem] md:flex">
		<kbd
			class="rounded border border-[var(--sl-border)] bg-[var(--sl-bg-elevated)] px-1.5 py-0.5 font-mono text-[var(--sl-text-3)]"
		>
			{isMac ? '⌘' : 'Ctrl'}
		</kbd>
		<kbd
			class="rounded border border-[var(--sl-border)] bg-[var(--sl-bg-elevated)] px-1.5 py-0.5 font-mono text-[var(--sl-text-3)]"
		>
			K
		</kbd>
	</span>
</button>
