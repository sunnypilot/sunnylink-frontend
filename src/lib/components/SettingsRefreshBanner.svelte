<script lang="ts">
	import { goto } from '$app/navigation';
	import { slide } from 'svelte/transition';
	import { cubicOut } from 'svelte/easing';
	import { ChevronDown, Info, X, RefreshCw } from 'lucide-svelte';
	import { deviceState } from '$lib/stores/device.svelte';
	import { refreshBanner } from '$lib/stores/refreshBanner.svelte';
	import { pendingChanges } from '$lib/stores/pendingChanges.svelte';

	let deviceId = $derived(deviceState.selectedDeviceId);
	let entries = $derived(deviceId ? refreshBanner.getAll(deviceId) : []);
	let expanded = $derived(deviceId ? refreshBanner.isExpanded(deviceId) : false);

	let hasPending = $derived(
		deviceId ? pendingChanges.getAll(deviceId).length > 0 : false
	);
	let tone = $derived<'info' | 'caution'>(hasPending ? 'caution' : 'info');

	// Wraps "x setting(s) refreshed from device" — singular/plural-aware.
	let countLabel = $derived(
		entries.length === 1 ? '1 setting refreshed from device' : `${entries.length} settings refreshed from device`
	);

	function toggleExpanded() {
		if (!deviceId) return;
		refreshBanner.setExpanded(deviceId, !expanded);
	}

	function dismissAll() {
		if (!deviceId) return;
		refreshBanner.dismissAll(deviceId);
	}

	function jumpTo(entry: (typeof entries)[number]) {
		if (!deviceId) return;
		const params = new URLSearchParams();
		if (entry.subPanelId) params.set('panel', entry.subPanelId);
		params.set('highlight', entry.key);
		// Jump-and-ack: removing from the list on click matches the pattern of
		// "viewing === acknowledging" (Gmail / Linear). The X remains the only
		// way to clear remaining entries in bulk.
		refreshBanner.dismissOne(deviceId, entry.key);
		void goto(`/dashboard/settings/${entry.panelId}?${params.toString()}`, {
			keepFocus: false,
			noScroll: true
		});
	}
</script>

{#if entries.length > 0}
	<div class="mx-auto mb-4 w-full max-w-2xl xl:max-w-3xl">
		<div
			role="status"
			aria-live="polite"
			class="overflow-hidden rounded-xl border transition-colors duration-150 {tone === 'caution'
				? 'border-amber-500/25 bg-amber-500/5 dark:bg-amber-500/10'
				: 'border-primary/25 bg-primary/5 dark:bg-primary/10'}"
		>
			<div class="flex items-center gap-3 px-4 py-3">
				<div
					class="rounded-full p-1.5 {tone === 'caution'
						? 'bg-amber-500/15 text-amber-600 dark:text-amber-400'
						: 'bg-primary/15 text-primary'}"
				>
					<RefreshCw size={16} aria-hidden="true" />
				</div>
				<div class="min-w-0 flex-1">
					<p
						class="text-sm font-medium {tone === 'caution'
							? 'text-amber-700 dark:text-amber-300'
							: 'text-[var(--sl-text-1)]'}"
					>
						{countLabel}
					</p>
					{#if tone === 'caution'}
						<p class="mt-0.5 text-[0.75rem] text-amber-700/80 dark:text-amber-400/80">
							You have unsaved local changes — review the updated values below.
						</p>
					{:else}
						<p class="mt-0.5 text-[0.75rem] text-[var(--sl-text-2)]">
							Changes were made on your device. Tap an item to review.
						</p>
					{/if}
				</div>
				<button
					type="button"
					onclick={toggleExpanded}
					aria-expanded={expanded}
					aria-label={expanded ? 'Collapse refreshed settings' : 'Expand refreshed settings'}
					class="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-[var(--sl-text-2)] transition-all duration-100 hover:bg-[var(--sl-bg-elevated)] hover:text-[var(--sl-text-1)] focus-visible:outline-2 focus-visible:outline-primary active:scale-[0.94]"
				>
					<ChevronDown
						size={18}
						class="transition-transform duration-150 {expanded ? 'rotate-180' : ''}"
						aria-hidden="true"
					/>
				</button>
				<button
					type="button"
					onclick={dismissAll}
					aria-label="Dismiss all refreshed-setting notifications"
					class="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-[var(--sl-text-2)] transition-all duration-100 hover:bg-[var(--sl-bg-elevated)] hover:text-[var(--sl-text-1)] focus-visible:outline-2 focus-visible:outline-primary active:scale-[0.94]"
				>
					<X size={16} aria-hidden="true" />
				</button>
			</div>

			{#if expanded}
				<div
					class="border-t {tone === 'caution'
						? 'border-amber-500/25'
						: 'border-primary/20'}"
					transition:slide={{ duration: 180, easing: cubicOut }}
				>
					<ul class="divide-y divide-[var(--sl-border-muted)]">
						{#each entries as entry (entry.key)}
							<li>
								<button
									type="button"
									onclick={() => jumpTo(entry)}
									class="flex w-full items-center gap-3 px-4 py-3 text-left transition-all duration-100 hover:bg-[var(--sl-bg-elevated)]/50 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-primary active:scale-[0.997] active:bg-[var(--sl-bg-elevated)]/75"
									aria-label={`Jump to ${entry.label}, refreshed from device`}
								>
									<Info
										size={14}
										class="shrink-0 {tone === 'caution'
											? 'text-amber-600 dark:text-amber-400'
											: 'text-primary'}"
										aria-hidden="true"
									/>
									<div class="min-w-0 flex-1">
										<p
											class="truncate text-[0.8125rem] font-medium text-[var(--sl-text-1)]"
										>
											{entry.label}
										</p>
									</div>
									<ChevronDown
										size={14}
										class="shrink-0 -rotate-90 text-[var(--sl-text-3)]"
										aria-hidden="true"
									/>
								</button>
							</li>
						{/each}
					</ul>
				</div>
			{/if}
		</div>
	</div>
{/if}
