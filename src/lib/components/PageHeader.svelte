<script lang="ts">
	import type { Snippet } from 'svelte';
	import BackLink from './BackLink.svelte';

	interface Props {
		/** Page title rendered as h1. */
		title: string;
		/** Plain-text subtitle. Ignored if `subtitleSnippet` is provided. */
		subtitle?: string;
		/** Back-link label — destination page name (e.g. "Home"), not "Back to …". */
		backLabel?: string;
		/** Fallback route for the back link when the browser has no in-app
		 *  history to pop (direct URL hit, hard refresh). */
		backHref?: string;
		/** Custom subtitle block (e.g. for inline rename UI). Overrides `subtitle`. */
		subtitleSnippet?: Snippet;
	}

	let { title, subtitle, backLabel, backHref, subtitleSnippet }: Props = $props();
</script>

<div class="px-4">
	{#if backLabel && backHref}
		<BackLink label={backLabel} fallback={backHref} class="mb-4" />
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
