<script lang="ts">
	import { fade } from 'svelte/transition';
	import { RefreshCw } from 'lucide-svelte';
	import type { SyncStatus } from '$lib/utils/syncStatus.svelte';

	interface Props {
		status: SyncStatus;
		onRefresh?: () => void;
	}

	let { status, onRefresh }: Props = $props();

	let isRefreshing = $derived(status === 'revalidating');
</script>

<span class="inline-flex items-center gap-1.5">
	{#if status === 'revalidating'}
		<span class="loading loading-spinner text-[var(--sl-text-3)]" style="width: 12px; height: 12px;" transition:fade={{ duration: 150 }}></span>
		<span class="text-[0.8125rem] font-normal text-[var(--sl-text-3)]" transition:fade={{ duration: 150 }}>Refreshing...</span>
	{:else if status === 'synced'}
		<svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" class="text-emerald-600 dark:text-emerald-400" transition:fade={{ duration: 150 }}><path d="M20 6 9 17l-5-5" /></svg>
		<span class="text-[0.8125rem] font-normal text-emerald-700 dark:text-emerald-400" transition:fade={{ duration: 150 }}>Up to date</span>
	{:else if status === 'failed'}
		<svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="text-amber-600 dark:text-amber-400" transition:fade={{ duration: 150 }}><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
		<span class="text-[0.8125rem] font-normal text-amber-700 dark:text-amber-400" transition:fade={{ duration: 150 }}>Could not refresh</span>
	{/if}
	{#if onRefresh}
		<button
			type="button"
			class="flex h-5 w-5 items-center justify-center rounded transition-colors {isRefreshing ? 'text-[var(--sl-text-3)]' : 'text-[var(--sl-text-3)] hover:bg-[var(--sl-bg-elevated)] hover:text-[var(--sl-text-2)]'}"
			onclick={onRefresh}
			disabled={isRefreshing}
			aria-label="Refresh"
			title="Refresh now"
		>
			<RefreshCw size={11} class="{isRefreshing ? 'animate-spin' : ''}" />
		</button>
	{/if}
</span>
