<script lang="ts">
	import { ChevronDown, ChevronUp, Check } from 'lucide-svelte';
	import { portal } from '$lib/utils/portal';
	import { tick } from 'svelte';
	import { fade, fly, scale } from 'svelte/transition';

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
	}

	let { options, value, disabled = false, disabledValues, onchange }: Props = $props();

	const BOTTOM_SHEET_THRESHOLD = 10;

	let open = $state(false);
	let triggerEl = $state<HTMLButtonElement | null>(null);
	let menuEl = $state<HTMLDivElement | null>(null);
	let scrollEl = $state<HTMLDivElement | null>(null);
	let menuStyle = $state('position:fixed;visibility:hidden;');

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
		menuStyle = 'position:fixed;visibility:hidden;';
		open = true;
		await tick();
		await new Promise<void>((r) => requestAnimationFrame(() => r()));
		if (!useBottomSheet) alignMenu();
	}

	function close() {
		open = false;
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
			menuStyle = `position:fixed;right:${menuRight}px;top:${idealTop}px;min-width:${menuMinWidth}px;`;
		} else {
			isClipped = true;
			const clampedTop = Math.max(margin, idealTop);
			const maxHeight = viewH - clampedTop - margin;

			menuStyle = `position:fixed;right:${menuRight}px;top:${clampedTop}px;min-width:${menuMinWidth}px;max-height:${maxHeight}px;`;

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
		const currentTop = parseFloat(menuStyle.match(/top:([^p]+)px/)?.[1] || '8');
		const heightDelta = newMaxHeight - menuEl.getBoundingClientRect().height;
		let newTop = currentTop - heightDelta * 0.5; // grow evenly from center
		newTop = Math.max(margin, Math.min(viewH - newMaxHeight - margin, newTop));

		// If fully expanded, remove clipping
		if (newMaxHeight >= menuFullHeight - 1) {
			isClipped = false;
			canScrollUp = false;
			canScrollDown = false;
			initialMaxHeight = 0;
			menuStyle = `position:fixed;right:${menuRight}px;top:${newTop}px;min-width:${menuMinWidth}px;`;
			el.scrollTop = 0;
		} else {
			menuStyle = `position:fixed;right:${menuRight}px;top:${newTop}px;min-width:${menuMinWidth}px;max-height:${newMaxHeight}px;`;
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

	// Body scroll lock while popover open. iOS Safari otherwise rubber-bands the
	// page behind the overlay; pin the body via position:fixed with scrollY offset.
	$effect(() => {
		if (typeof window === 'undefined') return;
		if (!open) return;

		const scrollY = window.scrollY;
		const html = document.documentElement;
		const body = document.body;
		const prev = {
			htmlOverflow: html.style.overflow,
			bodyPosition: body.style.position,
			bodyTop: body.style.top,
			bodyLeft: body.style.left,
			bodyRight: body.style.right,
			bodyWidth: body.style.width,
			bodyOverflow: body.style.overflow
		};

		html.style.overflow = 'hidden';
		body.style.position = 'fixed';
		body.style.top = `-${scrollY}px`;
		body.style.left = '0';
		body.style.right = '0';
		body.style.width = '100%';
		body.style.overflow = 'hidden';

		return () => {
			html.style.overflow = prev.htmlOverflow;
			body.style.position = prev.bodyPosition;
			body.style.top = prev.bodyTop;
			body.style.left = prev.bodyLeft;
			body.style.right = prev.bodyRight;
			body.style.width = prev.bodyWidth;
			body.style.overflow = prev.bodyOverflow;
			window.scrollTo(0, scrollY);
		};
	});
</script>

<button
	bind:this={triggerEl}
	type="button"
	class="inline-flex items-center gap-1.5 rounded-lg border border-[var(--sl-border)] bg-[var(--sl-bg-surface)] px-2.5 py-1.5 text-[0.8125rem] text-[var(--sl-text-1)] transition-colors hover:border-[var(--sl-text-3)] focus:outline-none"
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

{#if open}
	<div use:portal>
		<!-- svelte-ignore a11y_no_static_element_interactions -->
		<div
			class="fixed inset-0 z-[9998]"
			transition:fade={{ duration: 120 }}
			onmousedown={(e) => {
				e.preventDefault();
				e.stopPropagation();
				close();
			}}
			ontouchstart={(e) => {
				e.preventDefault();
				e.stopPropagation();
				close();
			}}
			onwheel={(e) => {
				e.preventDefault();
			}}
			ontouchmove={(e) => {
				e.preventDefault();
			}}
		></div>
		{#if useBottomSheet}
			<!-- ── Bottom-sheet variant (mobile, > 10 options) ──────────────────── -->
			<div
				bind:this={menuEl}
				transition:fly={{ y: 400, duration: 250 }}
				class="fixed inset-x-0 bottom-0 z-[9999] flex max-h-[75vh] flex-col overflow-hidden rounded-t-2xl border border-[var(--sl-border)] bg-[var(--sl-bg-surface)] shadow-2xl"
				role="listbox"
				style="padding-bottom: env(safe-area-inset-bottom);"
			>
				<!-- Drag handle (visual affordance, not draggable) -->
				<div class="flex shrink-0 items-center justify-center pt-2.5 pb-1.5">
					<div class="h-1 w-10 rounded-full bg-[var(--sl-border-emphasis)]"></div>
				</div>
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
		{:else}
			<!-- ── Anchored popover variant (default) ──────────────────────────── -->
			<div
				bind:this={menuEl}
				transition:scale={{ start: 0.96, duration: 150, opacity: 0 }}
				class="z-[9999] flex flex-col overflow-hidden rounded-xl border border-[var(--sl-border)] bg-[var(--sl-bg-surface)] shadow-sm"
				style={menuStyle}
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
