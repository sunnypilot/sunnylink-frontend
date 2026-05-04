<script lang="ts">
	import { Info, X } from 'lucide-svelte';
	import { fade, fly } from 'svelte/transition';
	import { cubicOut } from 'svelte/easing';
	import { portal } from '$lib/utils/portal';
	import { modalLock } from '$lib/utils/modalLock';

	interface Props {
		open: boolean;
		title: string;
		details: string;
	}

	let { open = $bindable(false), title, details }: Props = $props();

	/** Sanitize details: allow only <br> tags, escape everything else.
	 * Mirrors SchemaItemRenderer.sanitizeDescription so this widget can
	 * accept the same content the inline `description` accepts. */
	function sanitize(text: string): string {
		const escaped = text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
		return escaped.replace(/&lt;br\s*\/?&gt;/g, '<br />');
	}

	function close() {
		open = false;
	}

	function onKeydown(e: KeyboardEvent) {
		if (e.key === 'Escape') close();
	}
</script>

<svelte:window onkeydown={open ? onKeydown : null} />

{#if open}
	<div
		class="fixed inset-0 z-[9999] flex items-center justify-center p-4 sm:p-0"
		role="dialog"
		aria-modal="true"
		aria-labelledby="info-details-title"
		use:portal
		use:modalLock
	>
		<button
			class="absolute inset-0 bg-[var(--sl-overlay)]"
			transition:fade={{ duration: 150 }}
			onclick={close}
			aria-label="Close details"
		></button>
		<div
			class="relative w-full max-w-lg overflow-hidden rounded-2xl border border-[var(--sl-border)] bg-[var(--sl-bg-elevated)] shadow-2xl"
			transition:fly={{ y: 8, duration: 150, easing: cubicOut, opacity: 0 }}
		>
			<div class="flex items-start gap-3 border-b border-[var(--sl-border)] p-5">
				<div
					class="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[var(--sl-bg-subtle)] text-[var(--sl-text-2)]"
				>
					<Info size={18} />
				</div>
				<div class="min-w-0 flex-1 pt-0.5">
					<h3
						id="info-details-title"
						class="text-[0.95rem] leading-snug font-semibold text-[var(--sl-text-1)]"
					>
						{title}
					</h3>
				</div>
				<button
					class="ml-2 rounded-lg p-1.5 text-[var(--sl-text-3)] transition-colors hover:bg-[var(--sl-bg-subtle)] hover:text-[var(--sl-text-1)]"
					onclick={close}
					aria-label="Close"
				>
					<X size={16} />
				</button>
			</div>

			<div class="px-5 py-4 text-[0.875rem] leading-relaxed text-[var(--sl-text-2)]">
				{@html sanitize(details)}
			</div>

			<div
				class="flex justify-end border-t border-[var(--sl-border)] bg-[var(--sl-bg-input)] px-5 py-3"
			>
				<button
					class="btn text-[var(--sl-text-2)] btn-ghost transition-transform hover:text-[var(--sl-text-1)] active:scale-[0.98]"
					onclick={close}
				>
					Close
				</button>
			</div>
		</div>
	</div>
{/if}
