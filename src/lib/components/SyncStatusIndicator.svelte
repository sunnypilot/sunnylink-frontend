<script lang="ts">
	import { fade } from 'svelte/transition';
	import type { SyncStatus } from '$lib/utils/syncStatus.svelte';

	let { status }: { status: SyncStatus } = $props();
</script>

{#if status !== 'idle'}
	<span class="inline-flex items-center gap-1.5" transition:fade={{ duration: 150 }}>
		{#if status === 'revalidating'}
			<span class="loading loading-spinner text-[var(--sl-text-3)]" style="width: 12px; height: 12px;"></span>
			<span class="text-[0.8125rem] font-normal text-[var(--sl-text-3)]">Refreshing...</span>
		{:else if status === 'synced'}
			<svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" class="text-emerald-500"><path d="M20 6 9 17l-5-5" /></svg>
			<span class="text-[0.8125rem] font-normal text-emerald-500/80">Up to date</span>
		{:else if status === 'failed'}
			<svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="text-amber-500"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
			<span class="text-[0.8125rem] font-normal text-amber-500/80">Could not refresh</span>
		{/if}
	</span>
{/if}
