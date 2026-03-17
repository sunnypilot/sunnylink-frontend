<script lang="ts">
	import { fade, scale } from 'svelte/transition';
	import { AlertTriangle, Loader2 } from 'lucide-svelte';

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

	let borderClass = $derived(
		variant === 'danger' ? 'border-red-500/20' : variant === 'primary' ? 'border-blue-500/20' : 'border-[var(--sl-border)]'
	);
</script>

{#if open}
	<div
		class="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-0"
		role="dialog"
		aria-modal="true"
	>
		<!-- Backdrop -->
		<button
			class="absolute inset-0 bg-black/80 backdrop-blur-sm transition-opacity"
			transition:fade={{ duration: 200 }}
			onclick={close}
			aria-label="Close modal"
			disabled={isProcessing}
		></button>

		<!-- Modal Content -->
		<div
			class="relative w-full max-w-md overflow-hidden rounded-2xl border bg-[var(--sl-bg-input)] shadow-2xl {borderClass}"
			transition:scale={{ start: 0.95, duration: 200 }}
		>
			<div class="p-6">
				<div class="flex items-start gap-4">
					{#if variant === 'danger'}
						<div class="flex-shrink-0 rounded-full bg-red-500/10 p-3 text-red-500">
							<AlertTriangle size={24} />
						</div>
					{/if}
					<div>
						<h3 class="text-lg font-bold text-[var(--sl-text-1)]">{title}</h3>
						<p class="mt-2 text-sm text-[var(--sl-text-2)]">
							{message}
						</p>
					</div>
				</div>

				<div class="mt-6 flex justify-end gap-3">
					<button
						class="rounded-lg px-4 py-2.5 text-sm font-medium text-[var(--sl-text-2)] hover:text-[var(--sl-text-1)] disabled:opacity-50"
						onclick={close}
						disabled={isProcessing}
					>
						{cancelText}
					</button>
					<button
						class="flex items-center gap-2 rounded-lg px-4 py-2.5 text-sm font-bold text-[var(--sl-text-1)] transition-colors disabled:cursor-not-allowed disabled:opacity-50"
						class:bg-red-600={variant === 'danger'}
						class:hover:bg-red-700={variant === 'danger'}
						class:bg-blue-600={variant === 'primary'}
						class:hover:bg-blue-700={variant === 'primary'}
						onclick={onConfirm}
						disabled={isProcessing}
					>
						{#if isProcessing}
							<Loader2 size={16} class="animate-spin" />
						{/if}
						{confirmText}
					</button>
				</div>
			</div>
		</div>
	</div>
{/if}
