<script lang="ts">
	import { pendingChanges } from '$lib/stores/pendingChanges.svelte';
	import { deviceState } from '$lib/stores/device.svelte';
	import { schemaState } from '$lib/stores/schema.svelte';
	import { batchPush } from '$lib/stores/batchPush.svelte';
	import type { SchemaItem } from '$lib/types/schema';
	import { AlertTriangle, X, ChevronDown, ChevronUp, Shield, GitMerge } from 'lucide-svelte';
	import { slide } from 'svelte/transition';
	import { untrack } from 'svelte';
	import { toast } from 'svelte-sonner';

	interface Props {
		deviceId: string;
		onRetryFailed?: () => void;
	}

	let { deviceId, onRetryFailed }: Props = $props();

	let queuedCount = $derived(pendingChanges.getByStatus(deviceId, 'pending').length);
	let pushingCount = $derived(pendingChanges.getByStatus(deviceId, 'pushing').length);
	let confirmedCount = $derived(pendingChanges.getByStatus(deviceId, 'confirmed').length);
	let failedCount = $derived(pendingChanges.failedCount(deviceId));
	let blockedCount = $derived(pendingChanges.blockedCount(deviceId));
	let isFlushing = $derived(pendingChanges.isFlushing(deviceId));
	let isOnline = $derived(deviceState.onlineStatuses[deviceId] === 'online');
	let conflictCount = $derived(batchPush.getConflictCount(deviceId));
	let conflicts = $derived(batchPush.getConflicts(deviceId));
	let conflictEntries = $derived(Object.entries(conflicts).map(([key, c]) => ({ key, ...c })));
	let conflictExpanded = $state(true);

	// Toast on new conflict (0 → >0). Banner is sticky-top; toast nudges
	// scrolled-down users to look up.
	let lastConflictCount = 0;
	$effect(() => {
		const cur = conflictCount;
		untrack(() => {
			if (cur > lastConflictCount && cur > 0) {
				toast.warning(
					`${cur} setting${cur === 1 ? '' : 's'} differ on device — review at top of page.`,
					{ duration: 5_000 }
				);
			}
			lastConflictCount = cur;
		});
	});

	// Build key → SchemaItem lookup from schema for title + options resolution
	let keyToItem = $derived.by(() => {
		const schema = schemaState.schemas[deviceId];
		if (!schema?.panels) return {};
		const map: Record<string, SchemaItem> = {};
		function walkItems(items: SchemaItem[]) {
			for (const item of items) {
				if (item.key) map[item.key] = item;
				if (item.sub_items) walkItems(item.sub_items);
			}
		}
		for (const panel of schema.panels) {
			walkItems(panel.items ?? []);
			for (const section of panel.sections ?? []) {
				walkItems(section.items ?? []);
				for (const sp of section.sub_panels ?? []) {
					walkItems(sp.items ?? []);
				}
			}
			for (const sp of panel.sub_panels ?? []) {
				walkItems(sp.items ?? []);
			}
		}
		for (const brand of Object.values(schema.vehicle_settings ?? {})) {
			walkItems(brand.items ?? []);
		}
		return map;
	});

	// Only show for actionable states: failed (retry), conflict (review), or actively syncing.
	let showBanner = $derived(failedCount > 0 || blockedCount > 0 || isFlushing || conflictCount > 0);

	function handleDismissFailed() {
		const failed = pendingChanges.getByStatus(deviceId, 'failed');
		for (const entry of failed) {
			pendingChanges.remove(deviceId, entry.key);
		}
	}

	function normalizeForCompare(value: unknown): string {
		if (value === undefined || value === null) return '';
		if (typeof value === 'boolean') return value ? '1' : '0';
		return String(value);
	}

	function formatDriftValue(value: unknown, key: string): string {
		const item = keyToItem[key];
		// Resolve from schema options if available (e.g., "Default", "v1.0", "Aggressive")
		if (item?.options) {
			const normalized = normalizeForCompare(value);
			const match = item.options.find((o) => normalizeForCompare(o.value) === normalized);
			if (match) return match.label;
		}
		// Boolean display
		if (item?.widget === 'toggle') {
			if (value === true || value === 1 || value === '1') return 'ON';
			return 'OFF';
		}
		if (value === true || value === 1 || value === '1') return 'ON';
		if (value === false || value === 0 || value === '0') return 'OFF';
		if (value === '' || value === undefined || value === null) return 'Default';
		return String(value);
	}

	let statusText = $derived.by(() => {
		if (isFlushing)
			return `Syncing ${queuedCount + pushingCount} change${queuedCount + pushingCount === 1 ? '' : 's'}...`;
		if (queuedCount > 0) return `${queuedCount} change${queuedCount === 1 ? '' : 's'} pending`;
		if (confirmedCount > 0 && failedCount === 0)
			return `${confirmedCount} change${confirmedCount === 1 ? '' : 's'} synced`;
		return '';
	});

	let borderColor = $derived(
		failedCount > 0
			? 'border-red-500/30'
			: conflictCount > 0
				? 'border-amber-500/40'
				: blockedCount > 0
					? 'border-orange-500/30'
					: isFlushing
						? 'border-primary/30'
						: confirmedCount > 0
							? 'border-emerald-500/30'
							: 'border-amber-500/30'
	);

	let dotColor = $derived(
		failedCount > 0
			? 'bg-red-500'
			: conflictCount > 0
				? 'bg-amber-500'
				: blockedCount > 0
					? 'bg-orange-500'
					: isFlushing
						? 'bg-primary animate-pulse'
						: confirmedCount > 0
							? 'bg-emerald-500'
							: 'bg-amber-500'
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

			{#if statusText}
				<span class="flex-1 text-sm text-[var(--sl-text-2)]">{statusText}</span>
				{#if queuedCount > 0 && isOnline && !isFlushing}
					<span class="text-xs text-[var(--sl-text-3)]">Will sync automatically</span>
				{/if}
			{/if}

			{#if failedCount > 0}
				<span class="flex items-center gap-1.5 text-sm leading-none text-red-600 dark:text-red-400">
					<AlertTriangle size={14} />
					{failedCount} failed
				</span>
				{#if onRetryFailed}
					<button
						class="text-xs font-medium text-[var(--sl-text-1)] underline underline-offset-2 transition-all duration-100 hover:no-underline active:scale-[0.94] active:opacity-80"
						onclick={onRetryFailed}
					>
						Retry
					</button>
				{/if}
			{/if}
			{#if blockedCount > 0}
				<span
					class="flex items-center gap-1.5 text-sm leading-none text-orange-600 dark:text-orange-400"
				>
					<Shield size={14} />
					{blockedCount} blocked — vehicle is driving
				</span>
			{/if}

			{#if conflictCount > 0}
				<span
					class="flex items-center gap-1.5 text-sm leading-none text-amber-700 dark:text-amber-400"
				>
					<GitMerge size={14} />
					{conflictCount} pending {conflictCount === 1 ? 'change' : 'changes'} need review
				</span>
				<button
					class="flex items-center gap-0.5 text-xs font-medium text-[var(--sl-text-1)] underline underline-offset-2 transition-all duration-100 hover:no-underline active:scale-[0.94] active:opacity-80"
					onclick={() => (conflictExpanded = !conflictExpanded)}
				>
					{conflictExpanded ? 'Hide' : 'Review'}
					{#if conflictExpanded}
						<ChevronUp size={12} />
					{:else}
						<ChevronDown size={12} />
					{/if}
				</button>
			{/if}

			<!-- Dismiss X — far right, clears acknowledged failed entries -->
			{#if failedCount > 0}
				<span class="ml-auto"></span>
				<button
					class="flex h-11 w-11 items-center justify-center rounded-md text-[var(--sl-text-3)] transition-all duration-100 hover:bg-[var(--sl-bg-subtle)] hover:text-[var(--sl-text-2)] focus-visible:bg-[var(--sl-bg-subtle)] focus-visible:outline-none active:scale-[0.88] active:bg-[var(--sl-bg-elevated)]"
					onclick={handleDismissFailed}
					aria-label="Dismiss"
				>
					<X size={14} />
				</button>
			{/if}
		</div>

		{#if conflictCount > 0 && conflictExpanded}
			<div
				class="mt-2 border-t border-[var(--sl-border-muted)] pt-2"
				transition:slide={{ duration: 150 }}
			>
				<div class="mb-2 flex items-center justify-between gap-2">
					<span class="text-[0.75rem] text-[var(--sl-text-3)]">
						Device state changed while you were editing. Pick which value wins.
					</span>
					<div class="flex shrink-0 gap-2">
						<button
							class="rounded-md px-2 py-1 text-xs font-medium text-[var(--sl-text-1)] underline underline-offset-2 transition-all duration-100 hover:no-underline active:scale-[0.94] active:bg-[var(--sl-bg-subtle)]"
							onclick={() => batchPush.resolveApplyAll(deviceId)}
						>
							Apply all yours
						</button>
						<button
							class="rounded-md px-2 py-1 text-xs font-medium text-[var(--sl-text-1)] underline underline-offset-2 transition-all duration-100 hover:no-underline active:scale-[0.94] active:bg-[var(--sl-bg-subtle)]"
							onclick={() => batchPush.resolveKeepAll(deviceId)}
						>
							Keep all device
						</button>
					</div>
				</div>
				{#each conflictEntries as entry (entry.key)}
					{@const title = keyToItem[entry.key]?.title || entry.key}
					<div
						class="flex flex-col gap-2 py-1.5 sm:flex-row sm:items-center sm:justify-between sm:gap-3"
					>
						<div class="min-w-0 flex-1">
							<div class="text-[0.8125rem] font-medium break-words text-[var(--sl-text-1)]" {title}>
								{title}
							</div>
							<div class="mt-0.5 text-xs break-words text-[var(--sl-text-3)]">
								Your:
								<span class="font-medium text-[var(--sl-text-2)]"
									>{formatDriftValue(entry.yourValue, entry.key)}</span
								>
								<span class="mx-1">·</span>
								Device:
								<span class="font-medium text-[var(--sl-text-2)]"
									>{formatDriftValue(entry.deviceValue, entry.key)}</span
								>
							</div>
						</div>
						<div class="flex shrink-0 flex-wrap gap-1.5">
							<button
								class="rounded-md border border-[var(--sl-border)] bg-[var(--sl-bg-surface)] px-2.5 py-1 text-xs font-medium text-[var(--sl-text-1)] transition-all duration-100 hover:bg-[var(--sl-bg-subtle)] active:scale-[0.96] active:bg-[var(--sl-bg-elevated)]"
								onclick={() => batchPush.resolveApply(deviceId, entry.key)}
							>
								Apply yours
							</button>
							<button
								class="rounded-md border border-[var(--sl-border)] bg-[var(--sl-bg-surface)] px-2.5 py-1 text-xs font-medium text-[var(--sl-text-1)] transition-all duration-100 hover:bg-[var(--sl-bg-subtle)] active:scale-[0.96] active:bg-[var(--sl-bg-elevated)]"
								onclick={() => batchPush.resolveKeep(deviceId, entry.key)}
							>
								Keep device
							</button>
						</div>
					</div>
				{/each}
			</div>
		{/if}
	</div>
{/if}
