<script lang="ts">
	import { fade, fly } from 'svelte/transition';
	import type { Snippet } from 'svelte';

	let {
		children,
		actionSection,
		bottomOffsetClass = 'bottom-6 sm:bottom-10', // Default
		color = 'slate' // 'slate' | 'amber'
	} = $props<{
		children: Snippet;
		actionSection?: Snippet;
		bottomOffsetClass?: string;
		color?: 'slate' | 'amber';
	}>();

	const colorStyles: Record<string, { border: string; bg: string; separator: string }> = {
		slate: {
			border: 'border-[#334155]',
			bg: 'bg-[#1e293b]/90',
			separator: 'border-slate-700'
		},
		amber: {
			border: 'border-amber-500/30',
			bg: 'bg-[#1e293b]/90',
			separator: 'border-amber-500/20'
		}
	};

	const style = $derived(colorStyles[color as keyof typeof colorStyles] ?? colorStyles.slate);
</script>

<div
	transition:fly={{ y: 50, duration: 300 }}
	class="fixed left-1/2 z-40 flex max-w-[calc(100vw-2rem)] -translate-x-1/2 items-center gap-4 rounded-full border px-4 py-2 shadow-2xl backdrop-blur-md sm:px-6 sm:py-3 {bottomOffsetClass} {style.border} {style.bg} transition-all duration-300 ease-in-out"
>
	<div class="flex items-center gap-3 border-r pr-4 {style.separator}">
		{@render children()}
	</div>

	{#if actionSection}
		{@render actionSection()}
	{/if}
</div>
