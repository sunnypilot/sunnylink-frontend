<script lang="ts">
	import { onMount } from 'svelte';
	import { fade, scale } from 'svelte/transition';
	import { goto } from '$app/navigation';
	import { deviceState } from '$lib/stores/device.svelte';
	import { portal } from '$lib/utils/portal';
	import { modalLock } from '$lib/utils/modalLock';
	import { X, ArrowRight, Loader2 } from 'lucide-svelte';

	const DISMISS_KEY = 'sunnylink_welcome_dismissed_2_0';
	const PROXY_PREFIX = '/api/discourse';
	const CATEGORY_ID = 112;
	const REQUIRED_TAGS = ['sunnylink', 'official-updates'];

	type Tag = { name: string };
	type Topic = { id: number; title: string; slug: string; created_at: string; tags: Tag[] };

	let visible = $state(false);
	let latestTopic = $state<Topic | null>(null);
	let loadingPreview = $state(false);
	let attemptedPreview = $state(false);

	function alreadyDismissed(): boolean {
		try {
			return localStorage.getItem(DISMISS_KEY) === '1';
		} catch {
			return false;
		}
	}

	function markDismissed() {
		try {
			localStorage.setItem(DISMISS_KEY, '1');
		} catch {
			/* quota */
		}
	}

	// Heuristic for "returning user": Logto OIDC userinfo doesn't include account
	// creation date, so we use paired devices as a proxy. A user with paired
	// devices used the old sunnylink to pair them; a brand-new user won't.
	let qualifies = $derived(deviceState.pairedDevicesLoaded && deviceState.pairedDevices.length > 0);

	$effect(() => {
		if (!qualifies) return;
		if (alreadyDismissed()) return;
		visible = true;
	});

	async function loadPreview() {
		attemptedPreview = true;
		loadingPreview = true;
		try {
			const res = await fetch(`${PROXY_PREFIX}/c/announcements/${CATEGORY_ID}.json`);
			if (!res.ok) return;
			const data = await res.json();
			const all: Topic[] = data?.topic_list?.topics ?? [];
			const filtered = all
				.filter((t) => {
					const names = (t.tags || []).map((x) => x.name);
					return REQUIRED_TAGS.every((req) => names.includes(req));
				})
				.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
			latestTopic = filtered[0] ?? null;
		} catch {
			latestTopic = null;
		} finally {
			loadingPreview = false;
		}
	}

	$effect(() => {
		if (visible && !attemptedPreview && !loadingPreview) void loadPreview();
	});

	function dismiss() {
		markDismissed();
		visible = false;
	}

	function readMore() {
		markDismissed();
		visible = false;
		goto('/dashboard/whats-new');
	}

	function onKeydown(e: KeyboardEvent) {
		if (e.key === 'Escape' && visible) dismiss();
	}

	onMount(() => {
		window.addEventListener('keydown', onKeydown);
		return () => window.removeEventListener('keydown', onKeydown);
	});
</script>

{#if visible}
	<!-- svelte-ignore a11y_click_events_have_key_events -->
	<!-- svelte-ignore a11y_no_static_element_interactions -->
	<div
		use:portal
		use:modalLock
		class="fixed inset-0 z-[10000] flex items-center justify-center bg-black/50 px-4 backdrop-blur-sm"
		role="dialog"
		aria-modal="true"
		aria-labelledby="welcome-modal-title"
		transition:fade={{ duration: 200 }}
		onclick={(e) => {
			if (e.target === e.currentTarget) dismiss();
		}}
	>
		<div
			class="relative w-full max-w-md rounded-2xl border border-[var(--sl-border)] bg-[var(--sl-bg-surface)] p-6 shadow-xl"
			transition:scale={{ start: 0.95, duration: 200, opacity: 0 }}
		>
			<button
				type="button"
				class="absolute top-3 right-3 inline-flex h-9 w-9 items-center justify-center rounded-md text-[var(--sl-text-3)] transition-colors hover:bg-[var(--sl-bg-elevated)] hover:text-[var(--sl-text-1)] focus-visible:outline-2 focus-visible:outline-primary"
				onclick={dismiss}
				aria-label="Dismiss"
			>
				<X size={16} />
			</button>

			<h2
				id="welcome-modal-title"
				class="pr-10 text-[1.125rem] font-semibold tracking-[-0.01em] text-[var(--sl-text-1)]"
			>
				Welcome to the new sunnylink
			</h2>
			<p class="mt-2 text-[0.875rem] leading-relaxed text-[var(--sl-text-2)]">
				A redesigned dashboard, faster device management, and smoother settings flows. Works best
				with the latest sunnypilot — update on your device when you can.
			</p>

			{#if loadingPreview}
				<p class="mt-3 inline-flex items-center gap-2 text-[0.8125rem] text-[var(--sl-text-3)]">
					<Loader2 size={12} class="animate-spin" aria-hidden="true" />
					<span>Loading latest update…</span>
				</p>
			{:else if latestTopic}
				<p class="mt-3 text-[0.8125rem] text-[var(--sl-text-3)]">
					Latest:
					<a
						href="/dashboard/whats-new"
						onclick={(e) => {
							e.preventDefault();
							readMore();
						}}
						class="font-medium text-[var(--sl-text-2)] underline underline-offset-2 hover:text-[var(--sl-text-1)]"
					>
						{latestTopic.title}
					</a>
				</p>
			{/if}

			<button
				type="button"
				onclick={readMore}
				class="mt-5 inline-flex h-11 w-full items-center justify-center gap-1.5 rounded-lg bg-primary px-4 text-[0.875rem] font-medium text-white transition-colors hover:opacity-90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
			>
				<span>What's new</span>
				<ArrowRight size={14} aria-hidden="true" />
			</button>
		</div>
	</div>
{/if}
