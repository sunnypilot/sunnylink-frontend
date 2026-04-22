<script lang="ts">
	import { onMount } from 'svelte';
	import { fly } from 'svelte/transition';
	import { cubicOut } from 'svelte/easing';
	import { Share, SquarePlus, X, Smartphone } from 'lucide-svelte';
	import { portal } from '$lib/utils/portal';
	import { deviceState } from '$lib/stores/device.svelte';

	interface Props {
		title?: string;
		body?: string;
		shareLabel?: string;
		addLabel?: string;
		dismissLabel?: string;
		promptOnVisit?: number;
		timesToShow?: number;
		delayMs?: number;
		permanentlyHideOnDismiss?: boolean;
		debug?: boolean;
		onClose?: () => void;
	}

	let {
		title = 'Install sunnylink',
		body = 'Add to your Home Screen for fullscreen access and offline use.',
		shareLabel = "Tap the Share button in Safari's toolbar",
		addLabel = 'Choose "Add to Home Screen"',
		dismissLabel = 'Not now',
		promptOnVisit = 1,
		timesToShow = 3,
		delayMs = 3000,
		permanentlyHideOnDismiss = false,
		debug = false,
		onClose
	}: Props = $props();

	const STORAGE_KEY = 'iosPwaPrompt';
	const WELCOME_DISMISS_KEY = 'sunnylink_welcome_general_dismissed_v1';

	let shouldRender = $state(false);
	let isVisible = $state(false);
	let hasFired = $state(false);
	let promptData: { isiOS: boolean; visits: number } | null = null;
	let eligible = $state(false);

	function detectIOS(): boolean {
		if (typeof navigator === 'undefined') return false;
		const ua = navigator.userAgent.toLowerCase();
		const isiOS = /iphone|ipad|ipod/.test(ua);
		const isiPadOS =
			navigator.platform === 'MacIntel' && (navigator as Navigator).maxTouchPoints > 1;
		const isStandalone =
			'standalone' in window.navigator &&
			(window.navigator as Navigator & { standalone?: boolean }).standalone;
		return (isiOS || isiPadOS) && !isStandalone;
	}

	onMount(() => {
		try {
			const raw = localStorage.getItem(STORAGE_KEY);
			promptData = raw ? JSON.parse(raw) : null;
		} catch {
			promptData = null;
		}

		if (promptData === null) {
			promptData = { isiOS: detectIOS(), visits: 0 };
			localStorage.setItem(STORAGE_KEY, JSON.stringify(promptData));
		}

		if (!promptData.isiOS && !debug) return;

		eligible = true;
	});

	// Gate firing on the welcome-modal dismiss flag AND device selection.
	// The install prompt is low-priority; never interrupt the welcome modal
	// or a no-device user who's about to select a device from /dashboard/devices.
	$effect(() => {
		if (!eligible || hasFired) return;
		let dismissedGeneral = false;
		try {
			dismissedGeneral = localStorage.getItem(WELCOME_DISMISS_KEY) === '1';
		} catch {
			dismissedGeneral = false;
		}
		if (!debug) {
			if (!dismissedGeneral) return;
			if (!deviceState.selectedDeviceId) return;
		}

		if (!promptData) return;
		const aboveMin = promptData.visits + 1 >= promptOnVisit;
		const belowMax = promptData.visits + 1 < promptOnVisit + timesToShow;

		if (!belowMax && !debug) return;

		localStorage.setItem(
			STORAGE_KEY,
			JSON.stringify({ ...promptData, visits: promptData.visits + 1 })
		);

		if (!aboveMin && !debug) return;

		hasFired = true;
		shouldRender = true;
		const timeoutId = setTimeout(() => {
			isVisible = true;
		}, delayMs);
		return () => clearTimeout(timeoutId);
	});

	function dismiss() {
		isVisible = false;
		if (permanentlyHideOnDismiss && promptData) {
			localStorage.setItem(
				STORAGE_KEY,
				JSON.stringify({ ...promptData, visits: promptOnVisit + timesToShow })
			);
		}
		onClose?.();
		setTimeout(() => {
			shouldRender = false;
		}, 300);
	}

	function handleKeydown(e: KeyboardEvent) {
		if (e.key === 'Escape' && isVisible) dismiss();
	}
</script>

<svelte:window onkeydown={handleKeydown} />

{#if shouldRender}
	<!-- Non-modal bottom sheet. The outer fixed container sits at the bottom of
	     the viewport with pointer-events-none so the page behind stays fully
	     interactive. Only the inner panel captures clicks. No backdrop, no
	     blur — install is optional, blocking the app for it is a dark pattern. -->
	<div
		class="pointer-events-none fixed inset-x-0 bottom-0 z-[9999] flex items-end justify-center px-0 sm:px-4"
		aria-labelledby="pwa-prompt-title"
		aria-describedby="pwa-prompt-description"
		use:portal
	>
		{#if isVisible}
			<div
				class="pointer-events-auto relative w-full max-w-md overflow-hidden rounded-t-2xl border border-[var(--sl-border)] bg-[var(--sl-bg-surface)]/95 shadow-2xl backdrop-blur-md sm:mb-4 sm:rounded-2xl"
				style="padding-bottom: env(safe-area-inset-bottom);"
				role="region"
				transition:fly={{ y: 320, duration: 320, easing: cubicOut, opacity: 1 }}
			>
				<header
					class="flex items-center justify-between gap-3 border-b border-[var(--sl-border-muted)] px-5 py-3.5"
				>
					<div class="flex min-w-0 items-center gap-2.5">
						<span
							class="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary"
						>
							<Smartphone size={16} />
						</span>
						<h2
							id="pwa-prompt-title"
							class="truncate text-[0.9375rem] font-semibold text-[var(--sl-text-1)]"
						>
							{title}
						</h2>
					</div>
					<button
						type="button"
						onclick={dismiss}
						class="flex h-9 w-9 shrink-0 items-center justify-center rounded-md text-[var(--sl-text-3)] transition-all duration-100 hover:bg-[var(--sl-bg-elevated)] hover:text-[var(--sl-text-1)] focus-visible:bg-[var(--sl-bg-elevated)] focus-visible:outline-none active:scale-[0.88] active:bg-[var(--sl-bg-subtle)]"
						aria-label={dismissLabel}
					>
						<X size={16} />
					</button>
				</header>

				<div class="px-5 pt-4 pb-2">
					<p
						id="pwa-prompt-description"
						class="text-[0.8125rem] leading-relaxed text-[var(--sl-text-2)]"
					>
						{body}
					</p>
				</div>

				<ol class="space-y-2 px-5 py-4">
					<li
						class="flex items-center gap-3 rounded-xl border border-[var(--sl-border-muted)] bg-[var(--sl-bg-elevated)]/60 px-3.5 py-3"
					>
						<span
							class="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary/10 text-[0.6875rem] font-semibold text-primary"
							aria-hidden="true"
						>
							1
						</span>
						<span
							class="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[var(--sl-bg-input)] text-primary"
						>
							<Share size={18} strokeWidth={2.25} />
						</span>
						<span class="text-[0.8125rem] text-[var(--sl-text-1)]">{shareLabel}</span>
					</li>
					<li
						class="flex items-center gap-3 rounded-xl border border-[var(--sl-border-muted)] bg-[var(--sl-bg-elevated)]/60 px-3.5 py-3"
					>
						<span
							class="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary/10 text-[0.6875rem] font-semibold text-primary"
							aria-hidden="true"
						>
							2
						</span>
						<span
							class="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[var(--sl-bg-input)] text-primary"
						>
							<SquarePlus size={18} strokeWidth={2.25} />
						</span>
						<span class="text-[0.8125rem] text-[var(--sl-text-1)]">{addLabel}</span>
					</li>
				</ol>

				<div class="border-t border-[var(--sl-border-muted)] px-5 py-3">
					<button
						type="button"
						onclick={dismiss}
						class="flex min-h-[44px] w-full items-center justify-center rounded-lg text-[0.8125rem] font-medium text-[var(--sl-text-2)] transition-all duration-100 hover:bg-[var(--sl-bg-elevated)] hover:text-[var(--sl-text-1)] focus-visible:bg-[var(--sl-bg-elevated)] focus-visible:outline-none active:scale-[0.98] active:bg-[var(--sl-bg-subtle)]"
					>
						{dismissLabel}
					</button>
				</div>
			</div>
		{/if}
	</div>
{/if}
