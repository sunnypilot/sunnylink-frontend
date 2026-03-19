<script lang="ts">
	import { pendingChanges } from '$lib/stores/pendingChanges.svelte';
	import { driftStore } from '$lib/stores/driftStore.svelte';
	import { deviceState } from '$lib/stores/device.svelte';
	import { Upload, AlertTriangle, GitCompareArrows } from 'lucide-svelte';
	import { fly, fade } from 'svelte/transition';

	interface Props {
		deviceId: string;
		onRetryFailed?: () => void;
		onReviewDrift?: () => void;
	}

	let { deviceId, onRetryFailed, onReviewDrift }: Props = $props();

	let pendingCount = $derived(pendingChanges.pendingCount(deviceId));
	let failedCount = $derived(pendingChanges.failedCount(deviceId));
	let isFlushing = $derived(pendingChanges.isFlushing(deviceId));
	let driftCount = $derived(driftStore.count(deviceId));
	let isOnline = $derived(deviceState.onlineStatuses[deviceId] === 'online');

	let showBanner = $derived(pendingCount > 0 || failedCount > 0 || isFlushing || driftCount > 0);

	function handleDismissFailed() {
		const failed = pendingChanges.getByStatus(deviceId, 'failed');
		for (const entry of failed) {
			pendingChanges.remove(deviceId, entry.key);
		}
	}

	function handleDismissDrift() {
		driftStore.dismissAll(deviceId);
	}

	// Build a summary string for the floating pill
	let summaryText = $derived.by(() => {
		const parts: string[] = [];
		if (isFlushing) parts.push(`Syncing ${pendingCount}`);
		else if (pendingCount > 0) parts.push(`${pendingCount} queued`);
		if (failedCount > 0) parts.push(`${failedCount} failed`);
		if (driftCount > 0) parts.push(`${driftCount} drifted`);
		return parts.join(' · ');
	});

	let pillColor = $derived(
		failedCount > 0 ? 'border-red-500/30' :
		isFlushing ? 'border-primary/30' :
		driftCount > 0 ? 'border-cyan-500/30' :
		'border-amber-500/30'
	);

	let dotColor = $derived(
		failedCount > 0 ? 'bg-red-500' :
		isFlushing ? 'bg-primary animate-pulse' :
		driftCount > 0 ? 'bg-cyan-500' :
		'bg-amber-500'
	);
</script>

<!-- Floating status pill — fixed position, never pushes content.
     Follows Figma/Google Docs/Linear pattern: ambient, non-disruptive. -->
{#if showBanner}
	<div
		class="fixed bottom-4 left-1/2 z-40 -translate-x-1/2"
		in:fly={{ y: 20, duration: 200 }}
		out:fade={{ duration: 150 }}
	>
		<div class="flex items-center gap-2.5 rounded-full border {pillColor} bg-[var(--sl-bg-elevated)] px-4 py-2 shadow-lg backdrop-blur-md">
			<span class="block h-2 w-2 shrink-0 rounded-full {dotColor}"></span>
			<span class="whitespace-nowrap text-xs font-medium text-[var(--sl-text-2)]">{summaryText}</span>

			{#if failedCount > 0 && onRetryFailed}
				<button
					class="ml-1 text-xs font-medium text-[var(--sl-text-1)] underline underline-offset-2 hover:no-underline"
					onclick={onRetryFailed}
				>
					Retry
				</button>
			{/if}

			{#if failedCount > 0}
				<button
					class="text-xs text-[var(--sl-text-3)] hover:text-[var(--sl-text-2)]"
					onclick={handleDismissFailed}
				>
					Dismiss
				</button>
			{/if}

			{#if driftCount > 0}
				{#if onReviewDrift}
					<button
						class="ml-1 text-xs font-medium text-[var(--sl-text-1)] underline underline-offset-2 hover:no-underline"
						onclick={onReviewDrift}
					>
						Review
					</button>
				{/if}
				<button
					class="text-xs text-[var(--sl-text-3)] hover:text-[var(--sl-text-2)]"
					onclick={handleDismissDrift}
				>
					Dismiss
				</button>
			{/if}
		</div>
	</div>
{/if}
