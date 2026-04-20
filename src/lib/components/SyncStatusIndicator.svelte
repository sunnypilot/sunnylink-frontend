<script lang="ts">
	import { fade } from 'svelte/transition';
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
		class="inline-flex h-6 w-6 items-center justify-center rounded transition-colors {isRefreshing
			? 'cursor-not-allowed opacity-60'
			: 'text-[var(--sl-text-3)] hover:bg-[var(--sl-bg-elevated)] hover:text-[var(--sl-text-2)]'}"
		onclick={handleClick}
		aria-disabled={isRefreshing}
		aria-label={isRefreshing ? 'Refreshing' : isSynced ? 'Synced' : 'Refresh'}
		aria-live="polite"
		title={isRefreshing ? 'Refreshing' : 'Refresh'}
	>
		{#if isRefreshing}
			<span
				class="loading loading-spinner text-primary"
				style="width: 14px; height: 14px;"
				transition:fade={{ duration: 150 }}
			></span>
		{:else if isSynced}
			<span
				class="inline-flex text-emerald-600 dark:text-emerald-400"
				transition:fade={{ duration: 150 }}
			>
				<Check size={14} />
			</span>
		{:else}
			<span class="inline-flex" transition:fade={{ duration: 150 }}>
				<RefreshCw size={12} />
			</span>
		{/if}
	</button>
{/if}
