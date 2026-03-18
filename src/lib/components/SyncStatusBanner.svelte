<script lang="ts">
	import { pendingChanges } from '$lib/stores/pendingChanges.svelte';
	import { driftStore } from '$lib/stores/driftStore.svelte';
	import { deviceState } from '$lib/stores/device.svelte';
	import { Upload, AlertTriangle, RefreshCw, GitCompareArrows } from 'lucide-svelte';
	import { slide } from 'svelte/transition';

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

	// Show banner if there are any actionable states
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
</script>

{#if showBanner}
	<div class="mx-auto w-full max-w-2xl xl:max-w-3xl space-y-2" transition:slide={{ duration: 200 }}>
		<!-- Flushing: syncing in progress -->
		{#if isFlushing}
			<div class="flex items-center gap-2.5 rounded-lg border border-blue-500/20 bg-blue-500/5 px-4 py-2.5">
				<span class="loading loading-spinner loading-xs text-blue-400"></span>
				<p class="flex-1 text-sm text-blue-200/80">
					<span class="font-medium">Syncing</span> — Pushing {pendingCount} queued {pendingCount === 1 ? 'change' : 'changes'} to device...
				</p>
			</div>
		{/if}

		<!-- Pending: queued changes waiting for device -->
		{#if pendingCount > 0 && !isFlushing}
			<div class="flex items-center gap-2.5 rounded-lg border border-amber-500/20 bg-amber-500/5 px-4 py-2.5">
				<Upload size={16} class="shrink-0 text-amber-400" />
				<p class="flex-1 text-sm text-amber-200/80">
					<span class="font-medium">{pendingCount} {pendingCount === 1 ? 'change' : 'changes'} queued</span>
					{#if isOnline}
						— Ready to sync
					{:else}
						— Will sync when device reconnects
					{/if}
				</p>
			</div>
		{/if}

		<!-- Failed: changes that couldn't be pushed -->
		{#if failedCount > 0}
			<div class="flex items-center gap-2.5 rounded-lg border border-red-500/20 bg-red-500/5 px-4 py-2.5">
				<AlertTriangle size={16} class="shrink-0 text-red-400" />
				<p class="flex-1 text-sm text-red-200/80">
					<span class="font-medium">{failedCount} {failedCount === 1 ? 'change' : 'changes'} failed</span>
				</p>
				<div class="flex gap-1.5">
					{#if onRetryFailed}
						<button
							class="btn btn-ghost btn-xs text-red-400"
							onclick={onRetryFailed}
						>
							<RefreshCw size={12} />
							Retry
						</button>
					{/if}
					<button
						class="btn btn-ghost btn-xs text-red-400/60"
						onclick={handleDismissFailed}
					>
						Dismiss
					</button>
				</div>
			</div>
		{/if}

		<!-- Drift: device-side changes detected -->
		{#if driftCount > 0}
			<div class="flex items-center gap-2.5 rounded-lg border border-cyan-500/20 bg-cyan-500/5 px-4 py-2.5">
				<GitCompareArrows size={16} class="shrink-0 text-cyan-400" />
				<p class="flex-1 text-sm text-cyan-200/80">
					<span class="font-medium">{driftCount} {driftCount === 1 ? 'setting was' : 'settings were'} changed on-device</span>
				</p>
				<div class="flex gap-1.5">
					{#if onReviewDrift}
						<button
							class="btn btn-ghost btn-xs text-cyan-400"
							onclick={onReviewDrift}
						>
							Review
						</button>
					{/if}
					<button
						class="btn btn-ghost btn-xs text-cyan-400/60"
						onclick={handleDismissDrift}
					>
						Dismiss
					</button>
				</div>
			</div>
		{/if}
	</div>
{/if}
