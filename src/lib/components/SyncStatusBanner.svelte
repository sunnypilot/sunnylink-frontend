<script lang="ts">
	import { pendingChanges } from '$lib/stores/pendingChanges.svelte';
	import { driftStore } from '$lib/stores/driftStore.svelte';
	import { deviceState } from '$lib/stores/device.svelte';
	import { schemaState } from '$lib/stores/schema.svelte';
	import type { SchemaItem } from '$lib/types/schema';
	import { AlertTriangle, RefreshCw, X, ChevronDown, ChevronUp } from 'lucide-svelte';
	import { slide } from 'svelte/transition';
	import { formatRelativeTime } from '$lib/utils/time';
	import { onDestroy } from 'svelte';

	// Tick counter to keep relative timestamps live (updates every 15s)
	let timeTick = $state(0);
	const tickInterval = setInterval(() => { timeTick++; }, 15_000);
	onDestroy(() => clearInterval(tickInterval));

	interface Props {
		deviceId: string;
		onRetryFailed?: () => void;
	}

	let { deviceId, onRetryFailed }: Props = $props();

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
	let driftEntries = $derived(driftStore.getAll(deviceId));
	let isOnline = $derived(deviceState.onlineStatuses[deviceId] === 'online');

	// Group drifts by panel for the expanded list
	let driftsByPanel = $derived.by(() => {
		const groups: { panelId: string; panelLabel: string; entries: typeof driftEntries }[] = [];
		const map = new Map<string, typeof driftEntries>();
		for (const entry of driftEntries) {
			const id = entry.panelId;
			if (!id) continue; // Skip entries without a panel (non-schema params)
			if (!map.has(id)) {
				map.set(id, []);
				groups.push({ panelId: id, panelLabel: entry.panelLabel ?? id, entries: map.get(id)! });
			}
			map.get(id)!.push(entry);
		}
		return groups;
	});

	let driftExpanded = $state(false);

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

	// Only show for actionable states: failed (retry), drift (review), or actively syncing.
	let showBanner = $derived(failedCount > 0 || isFlushing || driftCount > 0);

	function handleDismissFailed() {
		const failed = pendingChanges.getByStatus(deviceId, 'failed');
		for (const entry of failed) {
			pendingChanges.remove(deviceId, entry.key);
		}
	}

	function handleDismissDrift() {
		driftStore.dismissAll(deviceId);
		driftExpanded = false;
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
			const match = item.options.find(o => normalizeForCompare(o.value) === normalized);
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
				<span class="flex items-center gap-1.5 text-sm text-red-600 dark:text-red-400">
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
			{/if}

			<!-- Drift -->
			{#if driftCount > 0}
				<span class="flex items-center gap-1.5 text-sm text-cyan-700 dark:text-cyan-400">
					<RefreshCw size={14} />
					{driftCount} drifted
				</span>
				<button
					class="flex items-center gap-0.5 text-xs font-medium text-[var(--sl-text-1)] underline underline-offset-2 hover:no-underline"
					onclick={() => (driftExpanded = !driftExpanded)}
				>
					{driftExpanded ? 'Hide' : 'Review'}
					{#if driftExpanded}
						<ChevronUp size={12} />
					{:else}
						<ChevronDown size={12} />
					{/if}
				</button>
			{/if}

			<!-- Dismiss X — far right, covers both failed and drift -->
			{#if failedCount > 0 || driftCount > 0}
				<span class="ml-auto"></span>
				<button
					class="text-[var(--sl-text-3)] hover:text-[var(--sl-text-2)]"
					onclick={() => { if (failedCount > 0) handleDismissFailed(); if (driftCount > 0) handleDismissDrift(); }}
					aria-label="Dismiss"
				>
					<X size={14} />
				</button>
			{/if}
		</div>

		<!-- Expanded drift list, grouped by panel -->
		{#if driftExpanded && driftEntries.length > 0}
			<div class="mt-2 border-t border-[var(--sl-border-muted)] pt-2" transition:slide={{ duration: 150 }}>
				{#each driftsByPanel as group (group.panelId)}
					{#if driftsByPanel.length > 1}
						<div class="mt-1.5 first:mt-0 mb-0.5 text-[0.6875rem] font-semibold uppercase tracking-wider text-[var(--sl-text-3)]">
							{group.panelLabel}
						</div>
					{/if}
					{#each group.entries as entry (entry.key)}
						<div class="flex items-center justify-between py-1.5 text-[0.8125rem]">
							<div class="min-w-0 flex-1">
								<span class="truncate text-[var(--sl-text-2)]">{keyToItem[entry.key]?.title || entry.key}</span>
								{#if driftsByPanel.length <= 1 && entry.panelLabel}
									<span class="ml-1.5 text-[0.6875rem] text-[var(--sl-text-3)]">{entry.panelLabel}</span>
								{/if}
								{#if entry.detectedAt}
									<span class="ml-1 text-[0.6875rem] text-[var(--sl-text-3)]">{void timeTick, formatRelativeTime(entry.detectedAt)}</span>
								{/if}
							</div>
							<span class="ml-3 shrink-0 text-xs tabular-nums text-[var(--sl-text-3)]">
								<span class="text-cyan-700 dark:text-cyan-400">{formatDriftValue(entry.cachedValue, entry.key)}</span>
								<span class="mx-1">&rarr;</span>
								<span class="text-[var(--sl-text-1)] font-medium">{formatDriftValue(entry.freshValue, entry.key)}</span>
							</span>
						</div>
					{/each}
				{/each}
			</div>
		{/if}
	</div>
{/if}
