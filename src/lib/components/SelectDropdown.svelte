<script lang="ts">
	import { ChevronDown, ChevronUp, Check, X } from 'lucide-svelte';
	import { portal } from '$lib/utils/portal';
	import { modalLock } from '$lib/utils/modalLock';
	import { tick } from 'svelte';
	import { fade, fly, scale } from 'svelte/transition';
	import { cubicOut } from 'svelte/easing';

	interface Option {
		value: string | number;
		label: string;
	}

	interface Props {
		options: Option[];
		value: unknown;
		disabled?: boolean;
		disabledValues?: Set<string | number>;
		onchange: (value: string | number) => void;
		/** Setting name shown in the bottom-sheet header so the user knows what
		 *  they're choosing (the trigger row gets covered when the sheet opens). */
		title?: string;
	}

	let { options, value, disabled = false, disabledValues, onchange, title = '' }: Props = $props();

	const BOTTOM_SHEET_THRESHOLD = 10;

	let open = $state(false);
	// Two-stage mount mirrors PWAInstallPrompt: `mounted` puts the portal wrapper
	// in the DOM first; on the next tick `open` flips true and Svelte sees the
	// transition siblings appear, which is when fly/fade fire correctly. Single-
	// stage {#if open} mounts wrapper + content in the same tick and the inner
	// transitions never fire visually (sheet just pops in after backdrop fade).
	let mounted = $state(false);
	let triggerEl = $state<HTMLButtonElement | null>(null);
	let menuEl = $state<HTMLDivElement | null>(null);
	let scrollEl = $state<HTMLDivElement | null>(null);
	// Individual reactive position props instead of a single style string. A single
	// style attribute being re-set during the scale transition would clobber the
	// transform Svelte writes for the animation; style: directives only touch
	// the property they own.
	let menuTop = $state(0);
	let menuRightPx = $state(0);
	let menuMinWidthPx = $state(0);
	let menuMaxHeightPx = $state<number | null>(null);

	let menuRight = 0;
	let menuMinWidth = 0;
	let menuFullHeight = 0;
	let isClipped = $state(false);
	let canScrollUp = $state(false);
	let canScrollDown = $state(false);

	let isMobile = $state(false);
	$effect(() => {
		if (typeof window === 'undefined') return;
		const mq = window.matchMedia('(max-width: 1023px)');
		isMobile = mq.matches;
		const handler = (e: MediaQueryListEvent) => (isMobile = e.matches);
		mq.addEventListener('change', handler);
		return () => mq.removeEventListener('change', handler);
	});

	let useBottomSheet = $derived(isMobile && options.length > BOTTOM_SHEET_THRESHOLD);

	let selectedLabel = $derived(options.find((o) => String(o.value) === String(value))?.label ?? '');

	async function toggle() {
		if (disabled) return;
		if (open) {
			close();
			return;
		}
		if (!useBottomSheet && triggerEl) {
			const r = triggerEl.getBoundingClientRect();
			menuRightPx = Math.max(8, document.documentElement.clientWidth - r.right);
			menuMinWidthPx = Math.max(r.width, 120);
			menuTop = r.bottom + 4;
			menuMaxHeightPx = null;
		}
		// Mount with closed state first; flip open on next paint so the CSS
		// transition has a real "from" frame to animate from. Svelte's
		// transition:fly was unreliable here (portaled element, multiple instances)
		// — pure CSS transition + class toggle is rock-solid.
		mounted = true;
		await tick();
		await new Promise<void>((r) => requestAnimationFrame(() => r()));
		open = true;
		await tick();
		await new Promise<void>((r) => requestAnimationFrame(() => r()));
		if (!useBottomSheet) alignMenu();
	}

	function close() {
		open = false;
		// Wait for the longest CSS transition (300ms) before unmounting so users
		// see the exit animation.
		setTimeout(() => {
			mounted = false;
		}, 320);
	}

	function select(opt: Option) {
		if (disabledValues?.has(opt.value)) return;
		onchange(opt.value);
		close();
	}

	function alignMenu() {
		if (!triggerEl || !menuEl || !scrollEl) return;
		const triggerRect = triggerEl.getBoundingClientRect();
		const viewH = window.innerHeight;
		const margin = 8;

		const optionEls = scrollEl.querySelectorAll('[role="option"]');
		const selIdx = Math.max(
			0,
			options.findIndex((o) => String(o.value) === String(value))
		);
		const selectedEl = optionEls[selIdx] as HTMLElement | undefined;
		if (!selectedEl) return;

		// Measure with no constraints (visibility:hidden, no max-height)
		const menuRect = menuEl.getBoundingClientRect();
		const selectedRect = selectedEl.getBoundingClientRect();
		const selectedOffsetInMenu = selectedRect.top - menuRect.top;

		menuFullHeight = menuRect.height;
		menuRight = document.documentElement.clientWidth - triggerRect.right;
		menuMinWidth = Math.max(triggerRect.width, 120);

		// Ideal: selected option overlaps trigger
		const idealTop = triggerRect.top - selectedOffsetInMenu;
		const idealBottom = idealTop + menuFullHeight;
		const fitsInViewport = idealTop >= margin && idealBottom <= viewH - margin;

		if (fitsInViewport) {
			isClipped = false;
			canScrollUp = false;
			canScrollDown = false;
			menuRightPx = menuRight;
			menuTop = idealTop;
			menuMinWidthPx = menuMinWidth;
			menuMaxHeightPx = null;
		} else {
			isClipped = true;
			const clampedTop = Math.max(margin, idealTop);
			const maxHeight = viewH - clampedTop - margin;

			menuRightPx = menuRight;
			menuTop = clampedTop;
			menuMinWidthPx = menuMinWidth;
			menuMaxHeightPx = maxHeight;

			// Scroll selected into view after style applies
			requestAnimationFrame(() => {
				selectedEl.scrollIntoView({ block: 'nearest' });
				updateScrollIndicators();
			});
		}
	}

	function updateScrollIndicators() {
		if (!scrollEl) return;
		const el = scrollEl;
		canScrollUp = el.scrollTop > 1;
		canScrollDown = el.scrollTop + el.clientHeight < el.scrollHeight - 1;
	}

	let initialMaxHeight = 0;

	function handleScroll() {
		updateScrollIndicators();

		if (!scrollEl || !isClipped || !menuEl || useBottomSheet) return;
		const el = scrollEl;
		const viewH = window.innerHeight;
		const margin = 8;
		const maxAvailable = viewH - margin * 2;

		// Can't expand beyond viewport
		if (menuFullHeight > maxAvailable) return;

		// Track initial max-height on first scroll
		if (initialMaxHeight === 0) {
			initialMaxHeight = menuEl.getBoundingClientRect().height;
		}

		// Calculate how much the user has scrolled (0 to maxScroll)
		const maxScroll = el.scrollHeight - el.clientHeight;
		if (maxScroll <= 0) return;
		const progress = el.scrollTop / maxScroll;

		// Grow max-height proportionally: from initial constrained height toward full height
		const growAmount = (menuFullHeight - initialMaxHeight) * progress;
		const newMaxHeight = initialMaxHeight + growAmount;

		// Adjust top position: shift upward as menu grows taller
		const currentTop = menuTop;
		const heightDelta = newMaxHeight - menuEl.getBoundingClientRect().height;
		let newTop = currentTop - heightDelta * 0.5; // grow evenly from center
		newTop = Math.max(margin, Math.min(viewH - newMaxHeight - margin, newTop));

		// If fully expanded, remove clipping
		if (newMaxHeight >= menuFullHeight - 1) {
			isClipped = false;
			canScrollUp = false;
			canScrollDown = false;
			initialMaxHeight = 0;
			menuRightPx = menuRight;
			menuTop = newTop;
			menuMinWidthPx = menuMinWidth;
			menuMaxHeightPx = null;
			el.scrollTop = 0;
		} else {
			menuRightPx = menuRight;
			menuTop = newTop;
			menuMinWidthPx = menuMinWidth;
			menuMaxHeightPx = newMaxHeight;
		}
	}

	function scrollUpClick() {
		scrollEl?.scrollBy({ top: -80, behavior: 'smooth' });
	}

	function scrollDownClick() {
		scrollEl?.scrollBy({ top: 80, behavior: 'smooth' });
	}

	function handleKeydown(e: KeyboardEvent) {
		if (!open) return;
		if (e.key === 'Escape') {
			close();
			e.preventDefault();
		}
		if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
			e.preventDefault();
			const idx = options.findIndex((o) => String(o.value) === String(value));
			const dir = e.key === 'ArrowDown' ? 1 : -1;
			let next = idx + dir;
			while (next >= 0 && next < options.length && disabledValues?.has(options[next]!.value)) {
				next += dir;
			}
			if (next >= 0 && next < options.length) {
				const opt = options[next];
				if (opt && !disabledValues?.has(opt.value)) onchange(opt.value);
			}
		}
		if (e.key === 'Enter') {
			close();
			e.preventDefault();
		}
	}

	$effect(() => {
		if (open) {
			document.addEventListener('keydown', handleKeydown);
			return () => {
				document.removeEventListener('keydown', handleKeydown);
			};
		}
	});

	// Body scroll lock applied via use:modalLock action on the open backdrop —
	// reference-counted across nested popovers, includes iOS touchmove handling.
</script>

<button
	bind:this={triggerEl}
	type="button"
	class="inline-flex items-center gap-1.5 rounded-lg border border-[var(--sl-border)] bg-[var(--sl-bg-surface)] px-2.5 py-1.5 text-[0.8125rem] text-[var(--sl-text-1)] transition-all duration-100 hover:border-[var(--sl-text-3)] focus:outline-none active:scale-[0.96] active:bg-[var(--sl-bg-subtle)]"
	class:opacity-50={disabled}
	class:pointer-events-none={disabled}
	{disabled}
	onclick={toggle}
	role="combobox"
	aria-expanded={open}
	aria-haspopup="listbox"
>
	<span class="truncate">{selectedLabel}</span>
	<span
		class="shrink-0 text-[var(--sl-text-3)] transition-transform duration-150"
		class:rotate-180={open}
	>
		<ChevronDown size={14} />
	</span>
</button>

{#if mounted}
	<!-- Two-stage mount: this outer block puts the portal wrapper into the DOM
	     immediately. The inner {#if open} block flips on the next tick so its
	     transition:fade / transition:fly children fire correctly. Cloning the
	     PWAInstallPrompt pattern verbatim — single-stage mounting was making the
	     bottom-sheet pop in instead of slide. -->
	<div
		use:portal
		class="pointer-events-none fixed inset-0 z-[9998] {useBottomSheet
			? 'flex items-end justify-center'
			: ''}"
		role={useBottomSheet ? 'dialog' : 'presentation'}
		aria-modal={useBottomSheet ? 'true' : undefined}
		aria-label={useBottomSheet ? title || 'Choose an option' : undefined}
	>
		<!-- Backdrop: Svelte transition:fade gates the dim + blur on open/close
		     so they fade with the sheet instead of snapping in. The earlier
		     CSS opacity-class toggle wasn't firing because the element was
		     inserted and its opacity class changed in near-consecutive frames
		     — the browser consolidated and skipped the from-state paint, so
		     the transition never ran. transition:fade applies inline opacity
		     via a tweened style, which sidesteps the timing issue entirely
		     and also gates modalLock's destroy (scroll unlock) on fade
		     completion. -->
		{#if open}
			<button
				type="button"
				use:modalLock
				transition:fade={{ duration: 200, easing: cubicOut }}
				class="pointer-events-auto absolute inset-0 {useBottomSheet
					? 'bg-[var(--sl-overlay)]'
					: ''}"
				onclick={close}
				aria-label="Close"
			></button>
		{/if}
		{#if useBottomSheet}
			<!-- ── Bottom-sheet variant (mobile, > 10 options) ──────────────────── -->
			<div
				bind:this={menuEl}
				class="pointer-events-auto relative flex max-h-[55vh] w-full flex-col overflow-hidden rounded-t-2xl border border-[var(--sl-border)] bg-[var(--sl-bg-surface)] shadow-2xl transition-transform duration-300 ease-out"
				class:translate-y-0={open}
				class:translate-y-full={!open}
				style="padding-bottom: env(safe-area-inset-bottom);"
			>
				<!-- Drag handle (visual affordance, not draggable) -->
				<div class="flex shrink-0 items-center justify-center pt-2.5 pb-1.5">
					<div class="h-1 w-10 rounded-full bg-[var(--sl-border-emphasis)]"></div>
				</div>
				{#if title}
					<!-- Title bar: tells user what setting they're choosing. The trigger
				     row underneath is covered by the sheet, so without this the user
				     can lose track. iOS HIG / Material modal sheet pattern. -->
					<div
						class="flex shrink-0 items-center justify-between gap-3 border-b border-[var(--sl-border-muted)] px-4 pt-1 pb-3"
					>
						<h3 class="truncate text-[0.9375rem] font-semibold text-[var(--sl-text-1)]">
							{title}
						</h3>
						<button
							type="button"
							onclick={close}
							class="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-[var(--sl-text-3)] transition-all duration-100 hover:bg-[var(--sl-bg-elevated)] hover:text-[var(--sl-text-1)] focus-visible:bg-[var(--sl-bg-elevated)] focus-visible:outline-none active:scale-[0.88] active:bg-[var(--sl-bg-subtle)]"
							aria-label="Close"
						>
							<X size={16} />
						</button>
					</div>
				{/if}
				<div role="listbox" aria-label={title || 'Options'} class="contents">
					<div
						bind:this={scrollEl}
						class="flex-1 overflow-y-auto"
						style="touch-action: pan-y; overscroll-behavior: contain;"
					>
						<div class="p-2">
							{#each options as opt (opt.value)}
								{@const isSelected = String(opt.value) === String(value)}
								{@const isOptDisabled = !!disabledValues?.has(opt.value)}
								<button
									type="button"
									class="flex w-full items-center justify-between rounded-lg px-3 py-3 text-[0.9375rem] transition-colors"
									class:bg-[var(--sl-bg-subtle)]={isSelected && !isOptDisabled}
									class:text-[var(--sl-text-1)]={!isOptDisabled}
									class:active:bg-[var(--sl-bg-subtle)]={!isOptDisabled && !isSelected}
									class:text-[var(--sl-text-3)]={isOptDisabled}
									class:opacity-40={isOptDisabled}
									class:cursor-not-allowed={isOptDisabled}
									role="option"
									aria-selected={isSelected}
									aria-disabled={isOptDisabled}
									onclick={() => select(opt)}
								>
									<span>{opt.label}</span>
									{#if isSelected && !isOptDisabled}
										<Check size={16} class="shrink-0 text-[var(--sl-text-2)]" />
									{/if}
								</button>
							{/each}
						</div>
					</div>
				</div>
			</div>
		{:else}
			<!-- ── Anchored popover variant (default) ──────────────────────────── -->
			<div
				bind:this={menuEl}
				class="pointer-events-auto flex origin-top flex-col overflow-hidden rounded-xl border border-[var(--sl-border)] bg-[var(--sl-bg-surface)] shadow-lg transition-[opacity,transform] duration-200 ease-out"
				class:opacity-100={open}
				class:scale-100={open}
				class:opacity-0={!open}
				class:scale-95={!open}
				style:position="fixed"
				style:top="{menuTop}px"
				style:right="{menuRightPx}px"
				style:min-width="{menuMinWidthPx}px"
				style:max-height={menuMaxHeightPx !== null ? `${menuMaxHeightPx}px` : null}
				role="listbox"
			>
				{#if canScrollUp}
					<!-- svelte-ignore a11y_no_static_element_interactions -->
					<div
						class="flex shrink-0 cursor-pointer items-center justify-center py-1 text-[var(--sl-text-3)] hover:text-[var(--sl-text-2)]"
						onmousedown={scrollUpClick}
					>
						<ChevronUp size={12} />
					</div>
				{/if}

				<div
					bind:this={scrollEl}
					class="relative flex-1 overflow-y-auto"
					class:scroll-fade-top={canScrollUp}
					class:scroll-fade-bottom={canScrollDown}
					style="touch-action: pan-y; overscroll-behavior: contain;"
					onscroll={handleScroll}
				>
					<div class="p-1.5">
						{#each options as opt (opt.value)}
							{@const isSelected = String(opt.value) === String(value)}
							{@const isOptDisabled = !!disabledValues?.has(opt.value)}
							<button
								type="button"
								class="flex w-full items-center justify-between rounded-lg px-2 py-1.5 text-[0.8125rem] transition-colors"
								class:bg-[var(--sl-bg-subtle)]={isSelected && !isOptDisabled}
								class:text-[var(--sl-text-1)]={!isOptDisabled}
								class:hover:bg-[var(--sl-bg-subtle)]={!isOptDisabled && !isSelected}
								class:text-[var(--sl-text-3)]={isOptDisabled}
								class:opacity-40={isOptDisabled}
								class:cursor-not-allowed={isOptDisabled}
								role="option"
								aria-selected={isSelected}
								aria-disabled={isOptDisabled}
								onclick={() => select(opt)}
							>
								<span>{opt.label}</span>
								{#if isSelected && !isOptDisabled}
									<Check size={14} class="shrink-0 text-[var(--sl-text-2)]" />
								{/if}
							</button>
						{/each}
					</div>
				</div>

				{#if canScrollDown}
					<!-- svelte-ignore a11y_no_static_element_interactions -->
					<div
						class="flex shrink-0 cursor-pointer items-center justify-center py-1 text-[var(--sl-text-3)] hover:text-[var(--sl-text-2)]"
						onmousedown={scrollDownClick}
					>
						<ChevronDown size={12} />
					</div>
				{/if}
			</div>
		{/if}
	</div>
{/if}

<style>
	/* Fade gradient masks for clipped edges */
	.scroll-fade-top {
		mask-image: linear-gradient(to bottom, transparent 0%, black 20px);
		-webkit-mask-image: linear-gradient(to bottom, transparent 0%, black 20px);
	}
	.scroll-fade-bottom {
		mask-image: linear-gradient(to top, transparent 0%, black 20px);
		-webkit-mask-image: linear-gradient(to top, transparent 0%, black 20px);
	}
	.scroll-fade-top.scroll-fade-bottom {
		mask-image: linear-gradient(
			to bottom,
			transparent 0%,
			black 20px,
			black calc(100% - 20px),
			transparent 100%
		);
		-webkit-mask-image: linear-gradient(
			to bottom,
			transparent 0%,
			black 20px,
			black calc(100% - 20px),
			transparent 100%
		);
	}
</style>
