<script lang="ts">
	import { pendingChanges } from '$lib/stores/pendingChanges.svelte';
	import { driftStore } from '$lib/stores/driftStore.svelte';
	import { deviceState } from '$lib/stores/device.svelte';
	import { Upload, AlertTriangle, RefreshCw, X } from 'lucide-svelte';
	import { slide } from 'svelte/transition';

	interface Props {
		deviceId: string;
		onRetryFailed?: () => void;
		onReviewDrift?: () => void;
	}

	let { deviceId, onRetryFailed, onReviewDrift }: Props = $props();

	let queuedCount = $derived(
		pendingChanges.getByStatus(deviceId, 'pending').length
	);
	let pushingCount = $derived(
		pendingChanges.getByStatus(deviceId, 'pushing').length
	);
	let confirmedCount = $derived(
		pendingChanges.getByStatus(deviceId, 'confirmed').length
	);
	let failedCount = $derived(pendingChanges.failedCount(deviceId));
	let isFlushing = $derived(pendingChanges.isFlushing(deviceId));
	let driftCount = $derived(driftStore.count(deviceId));
	let isOnline = $derived(deviceState.onlineStatuses[deviceId] === 'online');

	let showBanner = $derived(queuedCount > 0 || confirmedCount > 0 || failedCount > 0 || isFlushing || driftCount > 0);

	function handleDismissFailed() {
		const failed = pendingChanges.getByStatus(deviceId, 'failed');
		for (const entry of failed) {
			pendingChanges.remove(deviceId, entry.key);
		}
	}

	function handleDismissDrift() {
		driftStore.dismissAll(deviceId);
	}

	let statusText = $derived.by(() => {
		if (isFlushing) return `Syncing ${queuedCount + pushingCount} change${(queuedCount + pushingCount) === 1 ? '' : 's'}...`;
		if (queuedCount > 0) return `${queuedCount} change${queuedCount === 1 ? '' : 's'} pending`;
		if (confirmedCount > 0 && failedCount === 0) return `${confirmedCount} change${confirmedCount === 1 ? '' : 's'} synced`;
		return '';
	});

	let borderColor = $derived(
		failedCount > 0 ? 'border-red-500/30' :
		isFlushing ? 'border-primary/30' :
		confirmedCount > 0 ? 'border-emerald-500/30' :
		driftCount > 0 ? 'border-cyan-500/30' :
		'border-amber-500/30'
	);

	let dotColor = $derived(
		failedCount > 0 ? 'bg-red-500' :
		isFlushing ? 'bg-primary animate-pulse' :
		confirmedCount > 0 ? 'bg-emerald-500' :
		driftCount > 0 ? 'bg-cyan-500' :
		'bg-amber-500'
	);
</script>

<!-- Inline sync status banner — sits at top of settings content, not floating -->
{#if showBanner}
	<div
		class="mb-4 rounded-lg border {borderColor} bg-[var(--sl-bg-elevated)] px-4 py-2.5"
		transition:slide={{ duration: 200 }}
	>
		<div class="flex items-center gap-3">
			<span class="block h-2 w-2 shrink-0 rounded-full {dotColor}"></span>

			<!-- Queued / Syncing -->
			{#if statusText}
				<span class="flex-1 text-sm text-[var(--sl-text-2)]">{statusText}</span>
				{#if queuedCount > 0 && isOnline && !isFlushing}
					<span class="text-xs text-[var(--sl-text-3)]">Will sync automatically</span>
				{/if}
			{/if}

			<!-- Failed -->
			{#if failedCount > 0}
				<span class="flex items-center gap-1.5 text-sm text-red-400">
					<AlertTriangle size={14} />
					{failedCount} failed
				</span>
				{#if onRetryFailed}
					<button
						class="text-xs font-medium text-[var(--sl-text-1)] underline underline-offset-2 hover:no-underline"
						onclick={onRetryFailed}
					>
						Retry
					</button>
				{/if}
				<button
					class="text-[var(--sl-text-3)] hover:text-[var(--sl-text-2)]"
					onclick={handleDismissFailed}
					aria-label="Dismiss failed"
				>
					<X size={14} />
				</button>
			{/if}

			<!-- Drift -->
			{#if driftCount > 0}
				<span class="flex items-center gap-1.5 text-sm text-cyan-400">
					<RefreshCw size={14} />
					{driftCount} drifted
				</span>
				{#if onReviewDrift}
					<button
						class="text-xs font-medium text-[var(--sl-text-1)] underline underline-offset-2 hover:no-underline"
						onclick={onReviewDrift}
					>
						Review
					</button>
				{/if}
				<button
					class="text-[var(--sl-text-3)] hover:text-[var(--sl-text-2)]"
					onclick={handleDismissDrift}
					aria-label="Dismiss drift"
				>
					<X size={14} />
				</button>
			{/if}
		</div>
	</div>
{/if}
