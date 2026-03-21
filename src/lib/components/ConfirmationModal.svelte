<script lang="ts">
	import { fade, scale } from 'svelte/transition';
	import { Loader2 } from 'lucide-svelte';
	import { portal } from '$lib/utils/portal';

	let {
		open = $bindable(false),
		title,
		message,
		confirmText = 'Confirm',
		cancelText = 'Cancel',
		variant = 'danger',
		isProcessing = false,
		onConfirm
	} = $props<{
		open: boolean;
		title: string;
		message: string;
		confirmText?: string;
		cancelText?: string;
		variant?: 'danger' | 'primary';
		isProcessing?: boolean;
		onConfirm: () => void;
	}>();

	function close() {
		if (isProcessing) return;
		open = false;
	}
</script>

{#if open}
	<div
		class="fixed inset-0 z-[9999] flex items-center justify-center p-4 sm:p-0"
		role="dialog"
		aria-modal="true"
		use:portal
	>
		<!-- Backdrop -->
		<button
			class="absolute inset-0 bg-black/40 transition-opacity"
			transition:fade={{ duration: 200 }}
			onclick={close}
			aria-label="Close modal"
			disabled={isProcessing}
		></button>

		<!-- Modal Content -->
		<div
			class="relative w-full max-w-sm overflow-hidden rounded-xl border border-[var(--sl-border)] bg-[var(--sl-bg-surface)] shadow-2xl"
			transition:scale={{ start: 0.95, duration: 200 }}
		>
			<div class="p-5">
				<h3 class="text-[15px] font-semibold text-[var(--sl-text-1)]">{title}</h3>
				<p class="mt-2 text-[13px] leading-relaxed text-[var(--sl-text-2)]">
					{message}
				</p>

				<div class="mt-5 flex items-center justify-center gap-3">
					<button
						class="rounded-full border border-[var(--sl-border)] bg-[var(--sl-bg-elevated)] px-5 py-2 text-[13px] font-medium text-[var(--sl-text-1)] transition-colors hover:bg-[var(--sl-bg-input)] disabled:opacity-50"
						onclick={close}
						disabled={isProcessing}
					>
						{cancelText}
					</button>
					<button
						class="flex items-center gap-2 rounded-full px-5 py-2 text-[13px] font-medium text-white transition-colors disabled:cursor-not-allowed disabled:opacity-50"
						class:bg-red-600={variant === 'danger'}
						class:hover:bg-red-700={variant === 'danger'}
						class:bg-primary={variant === 'primary'}
						class:hover:opacity-90={variant === 'primary'}
						onclick={onConfirm}
						disabled={isProcessing}
					>
						{#if isProcessing}
							<Loader2 size={14} class="animate-spin" />
						{/if}
						{confirmText}
					</button>
				</div>
			</div>
		</div>
	</div>
{/if}
