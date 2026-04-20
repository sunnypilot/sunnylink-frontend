<script lang="ts">
	import { portal } from '$lib/utils/portal';
	import { scale } from 'svelte/transition';
	import { Info } from 'lucide-svelte';

	interface Props {
		text: string;
		/** Optional children. When omitted, set `asInfoButton` to render an (i) icon trigger. */
		children?: import('svelte').Snippet;
		/** Render the trigger as a compact (i) info button instead of wrapping children. */
		asInfoButton?: boolean;
		/** Accessible label for the info button variant. Defaults to "More info". */
		infoLabel?: string;
	}

	let { text, children, asInfoButton = false, infoLabel = 'More info' }: Props = $props();

	let visible = $state(false);
	let posX = $state(0);
	let posY = $state(0);
	let positioned = $state(false);
	let placeAbove = $state(false);
	let triggerEl: HTMLElement | undefined = $state();
	let tooltipEl: HTMLElement | undefined = $state();

	const VIEWPORT_MARGIN = 8;
	const TRIGGER_GAP = 8;

	// Ghost-event window — iOS/Android fire synthetic mouseenter + click after
	// touchend even with `preventDefault`, which would briefly re-show the
	// tooltip below the trigger right as the user lifts off. Suppressing
	// mouse/focus handlers for a short window after touch removes the flash.
	const GHOST_WINDOW_MS = 500;
	let lastTouchTs = 0;
	function isGhost() {
		return Date.now() - lastTouchTs < GHOST_WINDOW_MS;
	}

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

			let left = centerX - w / 2;
			left = Math.max(VIEWPORT_MARGIN, Math.min(vw - w - VIEWPORT_MARGIN, left));
			posX = left;

			const topAbove = rect.top - h - TRIGGER_GAP;
			const topBelow = rect.bottom + TRIGGER_GAP;
			if (preferAbove && topAbove >= VIEWPORT_MARGIN) {
				posY = topAbove;
				placeAbove = true;
			} else if (topBelow + h + VIEWPORT_MARGIN <= vh) {
				posY = topBelow;
				placeAbove = false;
			} else {
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

	function onMouseEnter() {
		if (isGhost()) return;
		show(false);
	}
	function onMouseLeave() {
		if (isGhost()) return;
		hide();
	}
	function onClick() {
		if (isGhost()) return;
		hide();
	}
	function onTouchStart(e: TouchEvent) {
		e.preventDefault();
		lastTouchTs = Date.now();
		show(true);
	}
	function onTouchEnd() {
		lastTouchTs = Date.now();
		hide();
	}
	function onFocus() {
		if (isGhost()) return;
		show(false);
	}
	function onBlur() {
		if (isGhost()) return;
		hide();
	}
</script>

{#if asInfoButton}
	<button
		type="button"
		bind:this={triggerEl}
		onmouseenter={onMouseEnter}
		onmouseleave={onMouseLeave}
		onclick={onClick}
		ontouchstart={onTouchStart}
		ontouchend={onTouchEnd}
		onfocus={onFocus}
		onblur={onBlur}
		class="inline-flex h-5 w-5 items-center justify-center rounded-full text-[var(--sl-text-3)] transition-colors hover:bg-[var(--sl-bg-elevated)] hover:text-[var(--sl-text-1)] focus-visible:bg-[var(--sl-bg-elevated)] focus-visible:text-[var(--sl-text-1)] focus-visible:outline-2 focus-visible:outline-primary"
		aria-label={infoLabel}
	>
		<Info size={14} aria-hidden="true" />
	</button>
{:else}
	<span
		bind:this={triggerEl}
		onmouseenter={onMouseEnter}
		onmouseleave={onMouseLeave}
		onclick={onClick}
		ontouchstart={onTouchStart}
		ontouchend={onTouchEnd}
		onfocus={onFocus}
		onblur={onBlur}
		class="inline-flex shrink-0"
		tabindex="0"
		role="note"
	>
		{#if children}{@render children()}{/if}
	</span>
{/if}

{#if visible}
	<div
		bind:this={tooltipEl}
		use:portal
		transition:scale={{ start: 0.96, duration: 120, opacity: 0 }}
		class="fixed z-[9999] w-max rounded-lg border border-[var(--sl-border)] bg-[var(--sl-bg-surface)] px-3 py-2 text-[0.8125rem] leading-relaxed font-normal text-[var(--sl-text-2)] shadow-md"
		style="left: {posX}px; top: {posY}px; max-width: min(400px, calc(100vw - {VIEWPORT_MARGIN *
			2}px)); visibility: {positioned ? 'visible' : 'hidden'};"
		role="tooltip"
		data-placement={placeAbove ? 'above' : 'below'}
	>
		{text}
	</div>
{/if}
