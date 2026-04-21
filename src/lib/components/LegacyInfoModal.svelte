<script lang="ts">
	import { onMount } from 'svelte';
	import { fade, scale } from 'svelte/transition';
	import { goto } from '$app/navigation';
	import { portal } from '$lib/utils/portal';
	import { modalLock } from '$lib/utils/modalLock';
	import { X, ArrowRight } from 'lucide-svelte';

	interface Props {
		open: boolean;
		onClose?: () => void;
	}

	let { open = $bindable(false), onClose }: Props = $props();

	function dismiss() {
		open = false;
		onClose?.();
	}

	function learnMore() {
		dismiss();
		goto('/dashboard/whats-new');
	}

	function onKeydown(e: KeyboardEvent) {
		if (e.key === 'Escape' && open) dismiss();
	}

	onMount(() => {
		window.addEventListener('keydown', onKeydown);
		return () => window.removeEventListener('keydown', onKeydown);
	});
</script>

{#if open}
	<!-- svelte-ignore a11y_click_events_have_key_events -->
	<!-- svelte-ignore a11y_no_static_element_interactions -->
	<div
		use:portal
		use:modalLock
		class="fixed inset-0 z-[10000] flex items-center justify-center bg-black/50 px-4 backdrop-blur-sm"
		role="dialog"
		aria-modal="true"
		aria-labelledby="legacy-modal-title"
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
				class="absolute top-3 right-3 inline-flex h-9 w-9 items-center justify-center rounded-md text-[var(--sl-text-3)] transition-all duration-100 hover:bg-[var(--sl-bg-elevated)] hover:text-[var(--sl-text-1)] focus-visible:outline-2 focus-visible:outline-primary active:scale-[0.88] active:bg-[var(--sl-bg-subtle)]"
				onclick={dismiss}
				aria-label="Dismiss"
			>
				<X size={16} />
			</button>

			<h2
				id="legacy-modal-title"
				class="pr-10 text-[1.125rem] font-semibold tracking-[-0.01em] text-[var(--sl-text-1)]"
			>
				A newer sunnypilot pairs better with sunnylink 2.0
			</h2>
			<p class="mt-2 text-[0.875rem] leading-relaxed text-[var(--sl-text-2)]">
				Recommended: update sunnypilot for the changes that work alongside sunnylink 2.0. You'll
				get:
			</p>
			<ul class="mt-3 space-y-1.5 text-[0.8125rem] text-[var(--sl-text-2)]">
				<li class="flex gap-2">
					<span class="text-primary">•</span>
					<span>The latest settings + toggles</span>
				</li>
				<li class="flex gap-2">
					<span class="text-primary">•</span>
					<span>Live vehicle data + capability refresh</span>
				</li>
				<li class="flex gap-2">
					<span class="text-primary">•</span>
					<span>The full sunnylink 2.0 experience</span>
				</li>
			</ul>

			<button
				type="button"
				onclick={learnMore}
				class="mt-5 inline-flex h-11 w-full items-center justify-center gap-1.5 rounded-lg bg-primary px-4 text-[0.875rem] font-medium text-white transition-all duration-100 hover:opacity-90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary active:scale-[0.98] active:bg-primary/80"
			>
				<span>Learn more</span>
				<ArrowRight size={14} aria-hidden="true" />
			</button>
		</div>
	</div>
{/if}
