<script lang="ts">
	import { statusPolling } from '$lib/stores/statusPolling.svelte';
	import { formatRelativeTime } from '$lib/utils/time';
	import { RefreshCw } from 'lucide-svelte';
	import { toast } from 'svelte-sonner';

	const SPAM_WINDOW_MS = 5_000;
	let lastClickAt = 0;

	let displayTime = $derived.by(() => {
		statusPolling.tickCounter;
		if (statusPolling.isRefreshing) return 'Refreshing…';
		if (statusPolling.lastCheckedAt === 0) return '';
		return formatRelativeTime(statusPolling.lastCheckedAt);
	});

	let staleClass = $derived.by(() => {
		if (statusPolling.isRefreshing) return 'text-[var(--sl-text-2)]';
		const s = statusPolling.staleness;
		if (s === 'critical') return 'text-amber-700 dark:text-amber-400';
		if (s === 'warn') return 'text-amber-600/80 dark:text-amber-400/60';
		return 'text-[var(--sl-text-3)]';
	});

	async function handleRefresh() {
		if (statusPolling.isRefreshing) {
			const now = Date.now();
			if (now - lastClickAt < SPAM_WINDOW_MS) {
				toast('Already refreshing', { duration: 2_000 });
			}
			lastClickAt = now;
			return;
		}
		lastClickAt = Date.now();
		await statusPolling.refreshNow();
	}
</script>

{#if displayTime}
	<div class="flex items-center gap-1.5">
		<span class="text-[0.6875rem] {staleClass}">
			{displayTime}
		</span>
		<button
			type="button"
			class="flex h-6 w-6 items-center justify-center rounded-md text-[var(--sl-text-3)] transition-all duration-100 hover:bg-[var(--sl-bg-elevated)] hover:text-[var(--sl-text-2)] active:scale-[0.88] active:bg-[var(--sl-bg-subtle)] disabled:cursor-not-allowed disabled:opacity-50 disabled:active:scale-100"
			onclick={handleRefresh}
			disabled={statusPolling.isRefreshing}
			aria-disabled={statusPolling.isRefreshing}
			aria-label="Refresh device status"
			title="Refresh now"
		>
			<RefreshCw
				size={12}
				class="transition-transform {statusPolling.isRefreshing ? 'animate-spin' : ''}"
			/>
		</button>
	</div>
{/if}
