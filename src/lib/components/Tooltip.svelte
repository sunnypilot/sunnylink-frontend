<script lang="ts">
	import { portal } from '$lib/utils/portal';
	import { fade, scale } from 'svelte/transition';

	interface Props {
		text: string;
		children: import('svelte').Snippet;
	}

	let { text, children }: Props = $props();

	let visible = $state(false);
	let posX = $state(0);
	let posY = $state(0);
	let positioned = $state(false);
	let triggerEl: HTMLElement | undefined = $state();
	let tooltipEl: HTMLElement | undefined = $state();

	const VIEWPORT_MARGIN = 8;

	function show() {
		if (!triggerEl) return;
		const rect = triggerEl.getBoundingClientRect();
		const centerX = rect.left + rect.width / 2;
		posY = rect.bottom + 6;
		// Initial placement — will be clamped once tooltip renders and we can
		// measure its real width. Render hidden until then to avoid a flash at
		// the wrong edge.
		posX = centerX;
		positioned = false;
		visible = true;
		queueMicrotask(() => {
			if (!tooltipEl) return;
			const w = tooltipEl.offsetWidth;
			const vw = window.innerWidth;
			let left = centerX - w / 2;
			left = Math.max(VIEWPORT_MARGIN, Math.min(vw - w - VIEWPORT_MARGIN, left));
			posX = left;
			positioned = true;
		});
	}

	function hide() {
		visible = false;
		positioned = false;
	}

	// PC: hover to show, leave to hide, click to dismiss
	function onMouseEnter() {
		show();
	}

	function onMouseLeave() {
		hide();
	}

	function onClick() {
		hide();
	}

	// Mobile: press-and-hold to show, release to hide
	function onTouchStart(e: TouchEvent) {
		e.preventDefault();
		show();
	}

	function onTouchEnd() {
		hide();
	}

	// Keyboard: focus to show, blur to hide
	function onFocus() {
		show();
	}

	function onBlur() {
		hide();
	}
</script>

<span
	bind:this={triggerEl}
	onmouseenter={onMouseEnter}
	onmouseleave={onMouseLeave}
	onclick={onClick}
	ontouchstart={onTouchStart}
	ontouchend={onTouchEnd}
	onfocus={onFocus}
	onblur={onBlur}
	class="inline-flex"
	tabindex="0"
	role="note"
>
	{@render children()}
</span>

{#if visible}
	<div
		bind:this={tooltipEl}
		use:portal
		transition:scale={{ start: 0.96, duration: 120, opacity: 0 }}
		class="fixed z-[9999] w-max rounded-lg border border-[var(--sl-border)] bg-[var(--sl-bg-surface)] px-3 py-2 text-[0.8125rem] leading-relaxed font-normal text-[var(--sl-text-2)] shadow-sm"
		style="left: {posX}px; top: {posY}px; max-width: min(400px, calc(100vw - {VIEWPORT_MARGIN * 2}px)); visibility: {positioned ? 'visible' : 'hidden'};"
		role="tooltip"
	>
		{text}
	</div>
{/if}
