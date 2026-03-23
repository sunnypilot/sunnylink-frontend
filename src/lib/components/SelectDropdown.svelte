<script lang="ts">
	import { ChevronDown, Check } from 'lucide-svelte';
	import { portal } from '$lib/utils/portal';
	import { tick } from 'svelte';

	interface Option {
		value: string | number;
		label: string;
	}

	interface Props {
		options: Option[];
		value: unknown;
		disabled?: boolean;
		onchange: (value: string | number) => void;
	}

	let { options, value, disabled = false, onchange }: Props = $props();

	let open = $state(false);
	let triggerEl = $state<HTMLButtonElement | null>(null);
	let menuEl = $state<HTMLDivElement | null>(null);
	let menuStyle = $state('position:fixed;visibility:hidden;');
	let isClipped = $state(false);

	let currentMenuTop = 0;
	let menuRight = 0;
	let menuMinWidth = 0;
	let menuFullHeight = 0;

	let selectedLabel = $derived(
		options.find((o) => String(o.value) === String(value))?.label ?? ''
	);

	async function toggle() {
		if (disabled) return;
		if (open) { close(); return; }
		menuStyle = 'position:fixed;visibility:hidden;';
		open = true;
		await tick();
		await new Promise<void>((r) => requestAnimationFrame(() => r()));
		alignMenu();
	}

	function close() {
		open = false;
	}

	function select(opt: Option) {
		onchange(opt.value);
		close();
	}

	function buildStyle(top: number, maxHeight?: number) {
		let s = `position:fixed;right:${menuRight}px;top:${top}px;min-width:${menuMinWidth}px;`;
		if (maxHeight !== undefined) s += `max-height:${maxHeight}px;`;
		return s;
	}

	function alignMenu() {
		if (!triggerEl || !menuEl) return;
		const triggerRect = triggerEl.getBoundingClientRect();
		const viewH = window.innerHeight;
		const margin = 8;

		const optionEls = menuEl.querySelectorAll('[role="option"]');
		const selIdx = Math.max(0, options.findIndex((o) => String(o.value) === String(value)));
		const selectedEl = optionEls[selIdx] as HTMLElement | undefined;
		if (!selectedEl) return;

		const menuRect = menuEl.getBoundingClientRect();
		const selectedRect = selectedEl.getBoundingClientRect();
		const selectedOffsetInMenu = selectedRect.top - menuRect.top;

		menuFullHeight = menuRect.height;
		menuRight = document.documentElement.clientWidth - triggerRect.right;
		menuMinWidth = Math.max(triggerRect.width, 120);

		// Ideal: selected option overlaps trigger
		currentMenuTop = triggerRect.top - selectedOffsetInMenu;

		const menuBottom = currentMenuTop + menuFullHeight;
		const fitsInViewport = currentMenuTop >= margin && menuBottom <= viewH - margin;

		if (fitsInViewport) {
			isClipped = false;
			menuStyle = buildStyle(currentMenuTop);
		} else {
			isClipped = true;
			const clampedTop = Math.max(margin, currentMenuTop);
			const maxHeight = Math.min(menuFullHeight, viewH - clampedTop - margin);
			currentMenuTop = clampedTop;
			menuStyle = buildStyle(clampedTop, maxHeight);

			requestAnimationFrame(() => {
				selectedEl.scrollIntoView({ block: 'nearest' });
			});
		}
	}

	function handleMenuScroll() {
		// Continuously expand the menu as user scrolls, revealing more items gradually
		if (!menuEl || !isClipped) return;

		const viewH = window.innerHeight;
		const margin = 8;
		const el = menuEl;

		// How much the user has scrolled inside the clipped menu
		const scrolled = el.scrollTop;
		const maxScroll = el.scrollHeight - el.clientHeight;
		if (maxScroll <= 0) return;

		// Progress: 0 = at top, 1 = at bottom
		const progress = scrolled / maxScroll;

		// Calculate the expanded height based on scroll progress
		const currentMaxHeight = el.clientHeight;
		const targetHeight = menuFullHeight;
		const maxAvailable = viewH - margin * 2;
		const expandedHeight = Math.min(targetHeight, maxAvailable);

		// Lerp between current constrained height and fully expanded height
		const newHeight = currentMaxHeight + (expandedHeight - currentMaxHeight) * progress;

		// Adjust top position to grow toward the available space
		// If originally clipped at top, grow upward; if at bottom, grow downward
		const originalClampedTop = Math.max(margin, currentMenuTop);
		let newTop: number;

		if (expandedHeight <= viewH - originalClampedTop - margin) {
			// Can grow downward from current top
			newTop = originalClampedTop;
		} else {
			// Need to shift up as we grow
			newTop = Math.max(margin, viewH - newHeight - margin);
		}

		// If fully expanded, remove scrollbar
		if (newHeight >= targetHeight - 1) {
			isClipped = false;
			const finalTop = Math.max(margin, Math.min(viewH - menuFullHeight - margin, newTop));
			currentMenuTop = finalTop;
			menuStyle = buildStyle(finalTop);
			el.scrollTop = 0;
		} else {
			menuStyle = buildStyle(newTop, newHeight);
		}
	}

	function handleKeydown(e: KeyboardEvent) {
		if (!open) return;
		if (e.key === 'Escape') { close(); e.preventDefault(); }
		if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
			e.preventDefault();
			const idx = options.findIndex((o) => String(o.value) === String(value));
			const next = e.key === 'ArrowDown'
				? Math.min(idx + 1, options.length - 1)
				: Math.max(idx - 1, 0);
			const opt = options[next];
			if (opt) onchange(opt.value);
		}
		if (e.key === 'Enter') { close(); e.preventDefault(); }
	}

	$effect(() => {
		if (open) {
			document.addEventListener('keydown', handleKeydown);
			return () => {
				document.removeEventListener('keydown', handleKeydown);
			};
		}
	});
</script>

<button
	bind:this={triggerEl}
	type="button"
	class="inline-flex items-center gap-1.5 rounded-lg border border-[var(--sl-border)] bg-[var(--sl-bg-input)] px-2.5 py-1.5 text-[0.8125rem] text-[var(--sl-text-1)] transition-colors hover:border-[var(--sl-text-3)] focus:outline-none"
	class:opacity-50={disabled}
	class:pointer-events-none={disabled}
	{disabled}
	onclick={toggle}
	role="combobox"
	aria-expanded={open}
	aria-haspopup="listbox"
>
	<span class="truncate">{selectedLabel}</span>
	<span class="shrink-0 text-[var(--sl-text-3)] transition-transform duration-150" class:rotate-180={open}>
		<ChevronDown size={14} />
	</span>
</button>

{#if open}
	<div use:portal>
		<!-- Invisible overlay: click to close, blocks interaction -->
		<!-- svelte-ignore a11y_no_static_element_interactions -->
		<div
			class="fixed inset-0 z-[9998]"
			onmousedown={(e) => { e.preventDefault(); e.stopPropagation(); close(); }}
		></div>
		<div
			bind:this={menuEl}
			class="z-[9999] rounded-xl border border-[var(--sl-border)] bg-[var(--sl-bg-elevated)] shadow-lg"
			class:overflow-hidden={!isClipped}
			class:overflow-y-auto={isClipped}
			style={menuStyle}
			role="listbox"
			onscroll={handleMenuScroll}
		>
			<div class="py-[5px]">
				{#each options as opt (opt.value)}
					{@const isSelected = String(opt.value) === String(value)}
					<button
						type="button"
						class="flex w-full items-center justify-between px-2.5 py-1.5 text-[0.8125rem] text-[var(--sl-text-1)] transition-colors hover:bg-[var(--sl-bg-subtle)]"
						class:bg-[var(--sl-bg-subtle)]={isSelected}
						role="option"
						aria-selected={isSelected}
						onclick={() => select(opt)}
					>
						<span>{opt.label}</span>
						{#if isSelected}
							<Check size={14} class="shrink-0 text-[var(--sl-text-2)]" />
						{/if}
					</button>
				{/each}
			</div>
		</div>
	</div>
{/if}
