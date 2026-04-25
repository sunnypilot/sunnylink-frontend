<script lang="ts">
	import { goto } from '$app/navigation';
	import { slide } from 'svelte/transition';
	import { cubicOut } from 'svelte/easing';
	import { ChevronDown, ChevronRight, RefreshCw, X } from 'lucide-svelte';
	import { deviceState } from '$lib/stores/device.svelte';
	import { refreshBanner } from '$lib/stores/refreshBanner.svelte';
	import { pendingChanges } from '$lib/stores/pendingChanges.svelte';
	import MarqueeText from '$lib/components/MarqueeText.svelte';

	let deviceId = $derived(deviceState.selectedDeviceId);
	let entries = $derived(deviceId ? refreshBanner.getAll(deviceId) : []);
	let expanded = $derived(deviceId ? refreshBanner.isExpanded(deviceId) : false);

	let hasPending = $derived(deviceId ? pendingChanges.getAll(deviceId).length > 0 : false);
	let tone = $derived<'info' | 'caution'>(hasPending ? 'caution' : 'info');

	let countLabel = $derived(
		entries.length === 1
			? '1 setting changed on device'
			: `${entries.length} settings changed on device`
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
		// Viewing == acknowledging (Gmail / Linear pattern). X remains the only
		// bulk clear for the remaining (unvisited) entries.
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
				: 'border-cyan-500/25 bg-cyan-500/5 dark:bg-cyan-500/10'}"
		>
			<div class="flex items-center gap-3 px-4 py-3">
				<div
					class="rounded-full p-1.5 {tone === 'caution'
						? 'bg-amber-500/15 text-amber-600 dark:text-amber-400'
						: 'bg-cyan-500/15 text-cyan-700 dark:text-cyan-400'}"
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
							Changes made on your device. Tap an item to review.
						</p>
					{/if}
				</div>
				<button
					type="button"
					onclick={toggleExpanded}
					aria-expanded={expanded}
					aria-label={expanded ? 'Collapse changed settings' : 'Expand changed settings'}
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
					aria-label="Dismiss all changed-setting notifications"
					class="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-[var(--sl-text-2)] transition-all duration-100 hover:bg-[var(--sl-bg-elevated)] hover:text-[var(--sl-text-1)] focus-visible:outline-2 focus-visible:outline-primary active:scale-[0.94]"
				>
					<X size={16} aria-hidden="true" />
				</button>
			</div>

			{#if expanded}
				<div
					class="border-t {tone === 'caution' ? 'border-amber-500/25' : 'border-cyan-500/20'}"
					transition:slide={{ duration: 180, easing: cubicOut }}
				>
					<ul class="divide-y divide-[var(--sl-border-muted)]">
						{#each entries as entry (entry.key)}
							<li>
								<button
									type="button"
									onclick={() => jumpTo(entry)}
									class="flex w-full items-start gap-3 px-4 py-3 text-left transition-all duration-100 hover:bg-[var(--sl-bg-elevated)]/50 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-primary active:scale-[0.997] active:bg-[var(--sl-bg-elevated)]/75"
									aria-label={`Jump to ${entry.label}, changed on device from ${entry.hadOld ? entry.oldDisplay : 'no previous value'} to ${entry.newDisplay}`}
								>
									<div class="min-w-0 flex-1">
										<MarqueeText
											text={`${entry.panelLabel} · ${entry.label}`}
											className="block text-[0.8125rem] font-medium text-[var(--sl-text-1)]"
										/>
										<p
											class="mt-0.5 text-[0.75rem] font-[450] text-[var(--sl-text-2)] tabular-nums"
										>
											{#if entry.hadOld}
												<span class="text-[var(--sl-text-3)]">{entry.oldDisplay}</span>
												<span class="mx-1 text-[var(--sl-text-3)]" aria-hidden="true">→</span>
												<span
													class="font-medium {tone === 'caution'
														? 'text-amber-700 dark:text-amber-300'
														: 'text-cyan-700 dark:text-cyan-400'}"
												>
													{entry.newDisplay}
												</span>
											{:else}
												<span class="text-[var(--sl-text-3)]">New:</span>
												<span
													class="ml-1 font-medium {tone === 'caution'
														? 'text-amber-700 dark:text-amber-300'
														: 'text-cyan-700 dark:text-cyan-400'}"
												>
													{entry.newDisplay}
												</span>
											{/if}
										</p>
									</div>
									<ChevronRight
										size={16}
										class="mt-0.5 shrink-0 text-[var(--sl-text-3)]"
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
