<script lang="ts">
	import { fade, scale } from 'svelte/transition';
	import { afterNavigate } from '$app/navigation';
	import { authState, logtoClient } from '$lib/logto/auth.svelte';
	import { LifeBuoy, Settings, LogOut, ChevronsUpDown } from 'lucide-svelte';
	import { portal } from '$lib/utils/portal';
	import { modalLock } from '$lib/utils/modalLock';
	import ThemeToggle from './ThemeToggle.svelte';

	interface Props {
		onNavigate?: () => void;
	}

	let { onNavigate }: Props = $props();

	let open = $state(false);
	let triggerEl = $state<HTMLButtonElement | null>(null);
	let menuStyle = $state('position:fixed;visibility:hidden;');

	function alignMenu() {
		if (!triggerEl) return;
		const rect = triggerEl.getBoundingClientRect();
		const bottom = Math.max(8, window.innerHeight - rect.top + 6);
		menuStyle = `position:fixed;bottom:${bottom}px;left:${rect.left}px;width:${rect.width}px;`;
	}

	// Layout-mounted component persists across navigations; close menu on nav.
	afterNavigate(() => {
		open = false;
	});

	$effect(() => {
		if (!open || typeof window === 'undefined' || !triggerEl) return;
		alignMenu();
		const handler = () => alignMenu();
		window.addEventListener('resize', handler);
		window.addEventListener('scroll', handler, true);
		// rAF poll — see DeviceStatusPill for rationale (min-h-screen prevents
		// ResizeObserver from firing on layout shifts).
		let lastTop = triggerEl.getBoundingClientRect().top;
		let lastLeft = triggerEl.getBoundingClientRect().left;
		let rafId = 0;
		function tick() {
			if (!triggerEl) return;
			const r = triggerEl.getBoundingClientRect();
			if (r.top !== lastTop || r.left !== lastLeft) {
				lastTop = r.top;
				lastLeft = r.left;
				alignMenu();
			}
			rafId = requestAnimationFrame(tick);
		}
		rafId = requestAnimationFrame(tick);
		return () => {
			window.removeEventListener('resize', handler);
			window.removeEventListener('scroll', handler, true);
			cancelAnimationFrame(rafId);
		};
	});

	const handleLogout = async () => {
		open = false;
		await logtoClient?.signOut(window.location.origin);
	};

	// Outside-click handled by portaled backdrop (use:modalLock); document
	// click listener removed so clicks below the backdrop don't pass through.

	// Close on Escape
	function handleKeydown(event: KeyboardEvent) {
		if (event.key === 'Escape' && open) {
			open = false;
		}
	}

	const initials = $derived(
		authState.profile?.name
			?.split(' ')
			.map((n) => n[0])
			.join('') ?? ''
	);
</script>

<svelte:window onkeydown={handleKeydown} />

<div data-account-menu>
	<button
		type="button"
		bind:this={triggerEl}
		class="group flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left transition-all duration-150 hover:bg-[var(--sl-bg-subtle)] active:scale-[0.98] active:bg-[var(--sl-bg-elevated)]"
		onclick={() => (open = !open)}
		aria-expanded={open}
		aria-haspopup="true"
	>
		<span
			class="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[var(--sl-bg-elevated)] text-[var(--sl-text-2)] transition-colors group-hover:text-[var(--sl-text-1)]"
		>
			{#if authState.profile?.picture}
				<img
					src={authState.profile.picture}
					alt={authState.profile?.name || ''}
					class="h-8 w-8 rounded-lg object-cover"
				/>
			{:else}
				<span class="text-[0.65rem] font-semibold">{initials}</span>
			{/if}
		</span>
		<span class="flex min-w-0 flex-1 flex-col overflow-hidden">
			<span class="truncate text-[0.8125rem] font-semibold text-[var(--sl-text-1)]">
				{authState.profile?.name}
			</span>
			{#if authState.profile?.email}
				<span class="truncate text-[0.6875rem] text-[var(--sl-text-3)]"
					>{authState.profile.email}</span
				>
			{/if}
		</span>
		<ChevronsUpDown size={14} class="shrink-0 text-[var(--sl-text-3)]" />
	</button>

	{#if open}
		<!-- Two-zone backdrop:
		     - Sidebar zone (left, sidebar width): close card only, swallow click
		       so sidebar nav items don't activate.
		     - Main zone (rest of viewport): close card AND collapse drawer on
		       mobile (onNavigate maps to layout's closeDrawerOnMobile). Desktop
		       sidebar is always-open, so onNavigate is a no-op there.
		     Both zones swallow the underlying click. -->
		<!-- svelte-ignore a11y_no_static_element_interactions -->
		<!-- svelte-ignore a11y_click_events_have_key_events -->
		<div
			use:portal
			use:modalLock
			class="fixed inset-y-0 left-0 z-[9998] w-72 lg:w-[18rem]"
			transition:fade={{ duration: 120 }}
			onclick={(e) => {
				e.stopPropagation();
				open = false;
			}}
		></div>
		<!-- svelte-ignore a11y_no_static_element_interactions -->
		<!-- svelte-ignore a11y_click_events_have_key_events -->
		<div
			use:portal
			class="fixed inset-y-0 right-0 left-72 z-[9998] lg:left-[18rem]"
			transition:fade={{ duration: 120 }}
			onclick={(e) => {
				e.stopPropagation();
				open = false;
				onNavigate?.();
			}}
		></div>
		<div
			use:portal
			class="z-[9999] origin-bottom rounded-xl border border-[var(--sl-border)] bg-[var(--sl-bg-elevated)] p-1.5"
			style={menuStyle}
			role="menu"
			transition:scale={{ start: 0.95, duration: 150, opacity: 0 }}
		>
			<div class="px-2.5 pt-1.5 pb-1.5">
				<p class="truncate text-[0.8125rem] font-medium text-[var(--sl-text-1)]">
					{authState.profile?.name}
				</p>
				{#if authState.profile?.email}
					<p class="truncate text-xs text-[var(--sl-text-3)]">{authState.profile.email}</p>
				{/if}
			</div>

			<div class="my-1 border-b border-[var(--sl-border-muted)]"></div>

			<div class="px-2.5 py-2">
				<p class="mb-2 text-xs font-semibold tracking-wider text-[var(--sl-text-3)] uppercase">
					Theme
				</p>
				<ThemeToggle fillWidth />
			</div>

			<div class="my-1 border-b border-[var(--sl-border-muted)]"></div>

			<div class="space-y-0.5">
				<a
					href="/dashboard/preferences"
					class="flex items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-[0.8125rem] text-[var(--sl-text-2)] transition-all duration-150 hover:bg-[var(--sl-bg-subtle)] hover:text-[var(--sl-text-1)] active:scale-[0.98] active:bg-[var(--sl-bg-elevated)]"
					role="menuitem"
					onclick={() => {
						open = false;
						onNavigate?.();
					}}
				>
					<Settings size={15} class="shrink-0" />
					<span>Preferences</span>
				</a>
				<a
					href="https://community.sunnypilot.ai/c/bug-reports/8"
					target="_blank"
					rel="noopener"
					class="flex items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-[0.8125rem] text-[var(--sl-text-2)] transition-all duration-150 hover:bg-[var(--sl-bg-subtle)] hover:text-[var(--sl-text-1)] active:scale-[0.98] active:bg-[var(--sl-bg-elevated)]"
					role="menuitem"
					onclick={() => (open = false)}
				>
					<LifeBuoy size={15} class="shrink-0" />
					<span>Support</span>
				</a>
			</div>

			<div class="my-1 border-b border-[var(--sl-border-muted)]"></div>

			<button
				type="button"
				class="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-[0.8125rem] text-[var(--sl-text-2)] transition-all duration-150 hover:bg-[var(--sl-bg-subtle)] hover:text-red-400 active:scale-[0.98] active:bg-red-500/10"
				role="menuitem"
				onclick={handleLogout}
			>
				<LogOut size={15} class="shrink-0" />
				<span>Log out</span>
			</button>
		</div>
	{/if}
</div>
