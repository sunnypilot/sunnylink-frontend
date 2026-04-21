<script lang="ts">
	import { ChevronLeft } from 'lucide-svelte';
	import { goto } from '$app/navigation';
	import type { Snippet } from 'svelte';

	interface Props {
		/** Page title rendered as h1. */
		title: string;
		/** Plain-text subtitle. Ignored if `subtitleSnippet` is provided. */
		subtitle?: string;
		/** Optional back-link label (paired with `backHref`). */
		backLabel?: string;
		/** Target href for the back link. */
		backHref?: string;
		/** Custom subtitle block (e.g. for inline rename UI). Overrides `subtitle`. */
		subtitleSnippet?: Snippet;
	}

	let { title, subtitle, backLabel, backHref, subtitleSnippet }: Props = $props();
</script>

<div class="px-4">
	{#if backLabel && backHref}
		<button
			type="button"
			onclick={() => goto(backHref!)}
			class="mb-4 inline-flex items-center gap-1 rounded-md px-1 py-0.5 text-[0.8125rem] font-medium text-[var(--sl-text-2)] transition-all duration-100 hover:text-[var(--sl-text-1)] active:scale-[0.96] active:bg-[var(--sl-bg-elevated)]"
		>
			<ChevronLeft size={14} aria-hidden="true" />
			{backLabel}
		</button>
	{/if}
	<h1 class="text-[24px] leading-[32px] font-medium tracking-[-0.16px] text-[var(--sl-text-1)]">
		{title}
	</h1>
	{#if subtitleSnippet}
		<div class="mt-1">
			{@render subtitleSnippet()}
		</div>
	{:else if subtitle}
		<p class="mt-1 text-[0.8125rem] font-[450] text-[var(--sl-text-2)]">
			{subtitle}
		</p>
	{/if}
</div>
