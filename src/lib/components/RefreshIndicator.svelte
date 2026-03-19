<script lang="ts">
	import { statusPolling } from '$lib/stores/statusPolling.svelte';
	import { formatRelativeTime } from '$lib/utils/time';
	import { RefreshCw } from 'lucide-svelte';

	// Trigger reactivity on tick counter updates
	let displayTime = $derived.by(() => {
		// Access tickCounter to re-derive every 10s
		statusPolling.tickCounter;
		if (statusPolling.lastCheckedAt === 0) return '';
		return formatRelativeTime(statusPolling.lastCheckedAt);
	});

	let staleClass = $derived.by(() => {
		const s = statusPolling.staleness;
		if (s === 'critical') return 'text-amber-500/80';
		if (s === 'warn') return 'text-amber-500/60';
		return 'text-[var(--sl-text-3)]';
	});

	async function handleRefresh() {
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
			class="flex h-6 w-6 items-center justify-center rounded-md text-[var(--sl-text-3)] transition-colors hover:bg-[var(--sl-bg-elevated)] hover:text-[var(--sl-text-2)] disabled:opacity-50"
			onclick={handleRefresh}
			disabled={statusPolling.isRefreshing}
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
