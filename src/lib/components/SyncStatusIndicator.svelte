<script lang="ts">
	import { RefreshCw, Check } from 'lucide-svelte';
	import type { SyncStatus } from '$lib/utils/syncStatus.svelte';
	import { toast } from 'svelte-sonner';

	interface Props {
		status: SyncStatus;
		onRefresh?: () => void;
	}

	let { status, onRefresh }: Props = $props();

	let isRefreshing = $derived(status === 'revalidating');
	let isSynced = $derived(status === 'synced');
	let lastClickAt = 0;
	const SPAM_WINDOW_MS = 5_000;

	function handleClick() {
		if (!onRefresh) return;
		if (isRefreshing) {
			const now = Date.now();
			if (now - lastClickAt < SPAM_WINDOW_MS) {
				toast('Already refreshing', { duration: 2_000 });
			}
			lastClickAt = now;
			return;
		}
		lastClickAt = Date.now();
		onRefresh();
	}
</script>

{#if onRefresh}
	<button
		type="button"
		class="relative inline-flex h-6 w-6 items-center justify-center rounded transition-colors {isRefreshing
			? 'cursor-not-allowed opacity-60'
			: 'text-[var(--sl-text-3)] hover:bg-[var(--sl-bg-elevated)] hover:text-[var(--sl-text-2)]'}"
		onclick={handleClick}
		aria-disabled={isRefreshing}
		aria-label={isRefreshing ? 'Refreshing' : isSynced ? 'Synced' : 'Refresh'}
		aria-live="polite"
		title={isRefreshing ? 'Refreshing' : 'Refresh'}
	>
		<span
			class="status-icon"
			class:visible={isRefreshing}
			aria-hidden={!isRefreshing}
		>
			<span
				class="loading loading-spinner text-primary"
				style="width: 14px; height: 14px;"
			></span>
		</span>
		<span
			class="status-icon text-emerald-600 dark:text-emerald-400"
			class:visible={!isRefreshing && isSynced}
			aria-hidden={!(!isRefreshing && isSynced)}
		>
			<Check size={14} />
		</span>
		<span
			class="status-icon"
			class:visible={!isRefreshing && !isSynced}
			aria-hidden={!(!isRefreshing && !isSynced)}
		>
			<RefreshCw size={12} />
		</span>
	</button>
{/if}

<style>
	/* Stack icons absolutely so cross-fades don't reflow the button.
	   Layout-shift-avoid + state-transition smoothness per UI/UX guidelines. */
	.status-icon {
		position: absolute;
		inset: 0;
		display: flex;
		align-items: center;
		justify-content: center;
		opacity: 0;
		transition:
			opacity 180ms ease-out,
			transform 180ms ease-out;
		transform: scale(0.92);
		pointer-events: none;
	}
	.status-icon.visible {
		opacity: 1;
		transform: scale(1);
	}
	@media (prefers-reduced-motion: reduce) {
		.status-icon {
			transition: opacity 80ms linear;
			transform: none;
		}
		.status-icon.visible {
			transform: none;
		}
	}
</style>
