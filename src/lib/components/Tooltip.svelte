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
	let placeAbove = $state(false);
	let triggerEl: HTMLElement | undefined = $state();
	let tooltipEl: HTMLElement | undefined = $state();

	const VIEWPORT_MARGIN = 8;
	const TRIGGER_GAP = 8;

	function show(preferAbove: boolean) {
		if (!triggerEl) return;
		const rect = triggerEl.getBoundingClientRect();
		const centerX = rect.left + rect.width / 2;
		posX = centerX;
		placeAbove = preferAbove;
		positioned = false;
		visible = true;
		queueMicrotask(() => {
			if (!tooltipEl) return;
			const w = tooltipEl.offsetWidth;
			const h = tooltipEl.offsetHeight;
			const vw = window.innerWidth;
			const vh = window.innerHeight;

			// Horizontal: keep tooltip inside viewport with margin.
			let left = centerX - w / 2;
			left = Math.max(VIEWPORT_MARGIN, Math.min(vw - w - VIEWPORT_MARGIN, left));
			posX = left;

			// Vertical: touch prefers above (finger blocks below); fall back
			// below if there isn't room. Mouse/keyboard default below.
			const topAbove = rect.top - h - TRIGGER_GAP;
			const topBelow = rect.bottom + TRIGGER_GAP;
			if (preferAbove && topAbove >= VIEWPORT_MARGIN) {
				posY = topAbove;
				placeAbove = true;
			} else if (topBelow + h + VIEWPORT_MARGIN <= vh) {
				posY = topBelow;
				placeAbove = false;
			} else {
				// Neither fits cleanly — clamp to the closer edge.
				posY = Math.max(VIEWPORT_MARGIN, topAbove);
				placeAbove = true;
			}
			positioned = true;
		});
	}

	function hide() {
		visible = false;
		positioned = false;
	}

	// PC: hover to show, leave to hide, click to dismiss. Position below.
	function onMouseEnter() {
		show(false);
	}
	function onMouseLeave() {
		hide();
	}
	function onClick() {
		hide();
	}

	// Mobile: press-and-hold to show, release to hide. Position ABOVE the
	// trigger so the user's finger doesn't cover the text (matches iOS/
	// Android native tooltip/popover behaviour).
	function onTouchStart(e: TouchEvent) {
		e.preventDefault();
		show(true);
	}
	function onTouchEnd() {
		hide();
	}

	// Keyboard: focus to show, blur to hide. Position below.
	function onFocus() {
		show(false);
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
		class="fixed z-[9999] w-max rounded-lg border border-[var(--sl-border)] bg-[var(--sl-bg-surface)] px-3 py-2 text-[0.8125rem] leading-relaxed font-normal text-[var(--sl-text-2)] shadow-md"
		style="left: {posX}px; top: {posY}px; max-width: min(400px, calc(100vw - {VIEWPORT_MARGIN * 2}px)); visibility: {positioned ? 'visible' : 'hidden'};"
		role="tooltip"
		data-placement={placeAbove ? 'above' : 'below'}
	>
		{text}
	</div>
{/if}
