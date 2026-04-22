<script lang="ts">
	import { tick } from 'svelte';
	import { fade, fly } from 'svelte/transition';
	import { cubicOut } from 'svelte/easing';
	import { afterNavigate, goto } from '$app/navigation';
	import { Bell, Sparkles } from 'lucide-svelte';
	import { portal } from '$lib/utils/portal';
	import { whatsNewStore } from '$lib/stores/whatsNew.svelte';
	import { paintBadge } from '$lib/utils/favicon';
	import { FEATURES } from '$lib/config/features';

	const unreadCount = $derived(whatsNewStore.unreadCount);
	const unread = $derived(whatsNewStore.unread);
	const displayCount = $derived(unreadCount > 9 ? '9+' : String(unreadCount));

	let triggerEl = $state<HTMLButtonElement | null>(null);
	let open = $state(false);
	let panelPos = $state({ top: 0, left: 0 });

	let rafId: number | null = null;
	let lastTop = 0;
	let lastLeft = 0;

	// Matches the CSS `w-[min(22rem,calc(100vw-1rem))]` so we can clamp the
	// panel horizontally such that both edges stay ≥8px on screen.
	const MAX_PANEL_WIDTH_PX = 352;
	const EDGE_MARGIN = 8;

	function measurePos() {
		if (!triggerEl) return null;
		const rect = triggerEl.getBoundingClientRect();
		const vw = window.innerWidth;
		const panelWidth = Math.min(MAX_PANEL_WIDTH_PX, vw - EDGE_MARGIN * 2);
		const triggerCenter = rect.left + rect.width / 2;
		// Center-align panel under the bell — feels spatially connected to the
		// trigger even when the bell sits mid-topbar. Right/left clamp keeps
		// the panel on-screen on narrow viewports.
		const idealLeft = triggerCenter - panelWidth / 2;
		const maxLeft = vw - panelWidth - EDGE_MARGIN;
		const left = Math.max(EDGE_MARGIN, Math.min(idealLeft, maxLeft));
		return {
			top: rect.bottom + 8,
			left
		};
	}

	function applyPosIfChanged() {
		const next = measurePos();
		if (!next) return;
		// Only write state when the trigger actually moved. Unconditional writes
		// during the open animation re-emit the style attributes every frame,
		// which reads as a "wiggle" on top of the scale transition.
		if (next.top !== lastTop || next.left !== lastLeft) {
			lastTop = next.top;
			lastLeft = next.left;
			panelPos = next;
		}
	}

	function trackPosition() {
		if (!open) return;
		applyPosIfChanged();
		rafId = requestAnimationFrame(trackPosition);
	}

	$effect(() => {
		if (open) {
			const initial = measurePos();
			if (initial) {
				lastTop = initial.top;
				lastLeft = initial.left;
				panelPos = initial;
			}
			rafId = requestAnimationFrame(trackPosition);
		}
		return () => {
			if (rafId !== null) cancelAnimationFrame(rafId);
			rafId = null;
		};
	});

	// Favicon badge mirrors unreadCount globally — paint whenever the count
	// flips between zero and non-zero.
	$effect(() => {
		if (FEATURES.faviconBadge) paintBadge(unreadCount > 0);
	});

	afterNavigate(() => {
		open = false;
	});

	async function toggleOpen() {
		open = !open;
		if (open) await tick();
	}

	function goToAll() {
		open = false;
		goto('/dashboard/whats-new');
	}

	function goToTopic(id: number) {
		open = false;
		goto(`/dashboard/whats-new/${id}`);
	}

	function formatShortDate(iso: string): string {
		try {
			const d = new Date(iso);
			const now = new Date();
			const diffMs = now.getTime() - d.getTime();
			const day = 24 * 60 * 60 * 1000;
			if (diffMs < day) return 'Today';
			if (diffMs < 2 * day) return 'Yesterday';
			if (diffMs < 7 * day) return `${Math.floor(diffMs / day)}d ago`;
			return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
		} catch {
			return '';
		}
	}

	function handleKeydown(e: KeyboardEvent) {
		if (e.key === 'Escape' && open) open = false;
	}
</script>

<svelte:window onkeydown={handleKeydown} />

<button
	bind:this={triggerEl}
	type="button"
	onclick={toggleOpen}
	class="relative inline-flex h-9 w-9 items-center justify-center rounded-full text-[var(--sl-text-2)] transition-all duration-100 hover:bg-[var(--sl-bg-elevated)] hover:text-[var(--sl-text-1)] focus-visible:outline-2 focus-visible:outline-primary active:scale-[0.92] active:bg-[var(--sl-bg-subtle)]"
	aria-label={unreadCount > 0 ? `Notifications, ${unreadCount} unread` : 'Notifications'}
	aria-haspopup="true"
	aria-expanded={open}
>
	<Bell size={18} aria-hidden="true" />
	{#if unreadCount > 0}
		<span
			class="absolute top-1 right-1 inline-flex h-[13px] min-w-[13px] items-center justify-center rounded-full bg-red-500 px-[3px] text-[0.5625rem] leading-none font-semibold text-white ring-[1.5px] ring-[var(--sl-bg-page)]"
			aria-hidden="true"
		>
			{displayCount}
		</span>
	{/if}
</button>

{#if open}
	<div
		use:portal
		class="fixed inset-0 z-[80]"
		onclick={() => (open = false)}
		onkeydown={(e) => e.key === 'Escape' && (open = false)}
		role="presentation"
		transition:fade={{ duration: 150 }}
	></div>
	<div
		use:portal
		role="dialog"
		aria-label="Notifications"
		class="fixed z-[81] w-[min(22rem,calc(100vw-1rem))] overflow-hidden rounded-xl border border-[var(--sl-border)] bg-[var(--sl-bg-surface)] shadow-xl"
		style="top: {panelPos.top}px; left: {panelPos.left}px;"
		transition:fly={{ y: -4, duration: 150, easing: cubicOut, opacity: 0 }}
	>
		<header class="flex items-center gap-2 border-b border-[var(--sl-border-muted)] px-4 py-3">
			<Sparkles size={14} class="text-primary" aria-hidden="true" />
			<span class="text-[0.8125rem] font-semibold text-[var(--sl-text-1)]">What's new</span>
		</header>

		{#if unread.length === 0}
			<div class="px-4 py-10 text-center">
				<p class="text-[0.8125rem] font-medium text-[var(--sl-text-2)]">You're all caught up</p>
				<p class="mt-1 text-[0.75rem] text-[var(--sl-text-3)]">
					We'll ping you when the team posts a new update.
				</p>
			</div>
		{:else}
			<ul class="max-h-[60vh] overflow-y-auto">
				{#each unread.slice(0, 5) as topic (topic.id)}
					<li>
						<button
							type="button"
							onclick={() => goToTopic(topic.id)}
							class="flex w-full items-start gap-3 px-4 py-3 text-left transition-colors hover:bg-[var(--sl-bg-elevated)]/60 focus-visible:bg-[var(--sl-bg-elevated)]/60 focus-visible:outline-none"
						>
							<span
								class="mt-1.5 inline-block h-2 w-2 shrink-0 rounded-full bg-primary"
								aria-hidden="true"
							></span>
							<div class="min-w-0 flex-1">
								<p class="line-clamp-2 text-[0.8125rem] font-medium text-[var(--sl-text-1)]">
									{topic.title}
								</p>
								<p class="mt-0.5 text-[0.6875rem] text-[var(--sl-text-3)]">
									{formatShortDate(topic.created_at)}
								</p>
							</div>
						</button>
					</li>
				{/each}
			</ul>
		{/if}

		<footer class="border-t border-[var(--sl-border-muted)]">
			<button
				type="button"
				onclick={goToAll}
				class="flex w-full items-center justify-center px-4 py-2.5 text-[0.75rem] font-medium text-[var(--sl-text-2)] transition-colors hover:bg-[var(--sl-bg-elevated)]/60 hover:text-[var(--sl-text-1)] focus-visible:bg-[var(--sl-bg-elevated)]/60 focus-visible:outline-none"
			>
				See all announcements
			</button>
		</footer>
	</div>
{/if}
