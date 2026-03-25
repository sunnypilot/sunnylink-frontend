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

	function updatePosition() {
		if (!triggerEl) return;
		const rect = triggerEl.getBoundingClientRect();
		x = rect.left + rect.width / 2;
		y = rect.bottom + 6;
	}

	// PC: hover to show, leave to hide, click to dismiss
	function onMouseEnter() {
		updatePosition();
		visible = true;
	}

	function onMouseLeave() {
		visible = false;
	}

	function onClick() {
		visible = false;
	}

	// Mobile: press-and-hold to show, release to hide
	function onTouchStart(e: TouchEvent) {
		e.preventDefault();
		updatePosition();
		visible = true;
	}

	function onTouchEnd() {
		visible = false;
	}

	// Keyboard: focus to show, blur to hide
	function onFocus() {
		updatePosition();
		visible = true;
	}

	function onBlur() {
		visible = false;
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
		use:portal
		class="fixed z-[9999] w-max max-w-[400px] rounded-lg border border-[var(--sl-border)] bg-[var(--sl-bg-surface)] px-3 py-2 text-[0.8125rem] font-normal leading-relaxed text-[var(--sl-text-2)] shadow-sm"
		style="left: {x}px; top: {y}px; transform: translateX(-50%);"
		role="tooltip"
	>
		{text}
	</div>
{/if}
