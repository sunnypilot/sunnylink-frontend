<script lang="ts">
	import { portal } from '$lib/utils/portal';

	interface Props {
		text: string;
		children: import('svelte').Snippet;
	}

	let { text, children }: Props = $props();

	let visible = $state(false);
	let x = $state(0);
	let y = $state(0);
	let triggerEl: HTMLElement | undefined = $state();

	function show() {
		if (!triggerEl) return;
		const rect = triggerEl.getBoundingClientRect();
		x = rect.left + rect.width / 2;
		y = rect.bottom + 6;
		visible = true;
	}

	function hide() {
		visible = false;
	}
</script>

<span
	bind:this={triggerEl}
	onmouseenter={show}
	onmouseleave={hide}
	onfocus={show}
	onblur={hide}
	class="inline-flex"
	tabindex="0"
	role="note"
>
	{@render children()}
</span>

{#if visible}
	<div
		use:portal
		class="fixed z-[9999] max-w-[280px] rounded-md bg-[#1c1c1c] px-3 py-2 text-[0.8125rem] font-normal leading-relaxed text-[#e0e0e0] shadow-xl"
		style="left: {x}px; top: {y}px; transform: translateX(-50%);"
		role="tooltip"
	>
		{text}
	</div>
{/if}
