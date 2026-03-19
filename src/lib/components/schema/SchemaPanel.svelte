<script lang="ts">
	import SchemaItemRenderer from './SchemaItemRenderer.svelte';
	import { schemaState } from '$lib/stores/schema.svelte';
	import { deviceState } from '$lib/stores/device.svelte';
	import { isVisible, evaluateRule, type RuleContext } from '$lib/rules/evaluator';
	import type { Panel, SubPanel, SchemaItem } from '$lib/types/schema';
	import { ChevronRight } from 'lucide-svelte';

	interface Props {
		deviceId: string;
		panel: Panel;
		loadingValues?: boolean;
		readonly?: boolean;
		onSubPanelOpen?: (subPanel: SubPanel) => void;
	}

	let {
		deviceId,
		panel,
		loadingValues = false,
		readonly = false,
		onSubPanelOpen
	}: Props = $props();

	let ruleContext: RuleContext = $derived({
		capabilities: schemaState.capabilities[deviceId] ?? null,
		paramValues: deviceState.deviceValues[deviceId] ?? {},
		isOffroad: deviceState.offroadStatuses[deviceId]?.isOffroad ?? true
	});

	let activeSubPanels: SubPanel[] = $derived(
		(panel.sub_panels ?? []).filter((sp) => {
			if (!sp.trigger_condition) return true;
			return evaluateRule(sp.trigger_condition, ruleContext);
		})
	);

	// Build a map: trigger_key -> SubPanel for inline rendering
	let subPanelByTrigger: Record<string, SubPanel> = $derived.by(() => {
		const map: Record<string, SubPanel> = {};
		for (const sp of activeSubPanels) {
			map[sp.trigger_key] = sp;
		}
		return map;
	});

	// Collect sub-panels that DON'T match any visible item (orphaned — render at bottom)
	let orphanedSubPanels: SubPanel[] = $derived.by(() => {
		const itemKeys = new Set(panel.items.map((i) => i.key));
		return activeSubPanels.filter((sp) => !itemKeys.has(sp.trigger_key));
	});

	// ── Group items into sections ────────────────────────────────────────
	type ItemGroup = { label?: string; items: SchemaItem[] };

	function isSectionHeader(item: SchemaItem): boolean {
		if (item.widget === 'info' && !item.options) return true;
		if (item.widget === 'multiple_button' && (!item.options || item.options.length === 0)) return true;
		return false;
	}

	let itemGroups: ItemGroup[] = $derived.by(() => {
		const groups: ItemGroup[] = [];
		let current: ItemGroup = { items: [] };

		for (const item of panel.items) {
			if (isSectionHeader(item) && isVisible(item.visibility, ruleContext)) {
				if (current.items.length > 0) {
					groups.push(current);
				}
				current = { label: item.title || item.key, items: [] };
			} else {
				current.items.push(item);
			}
		}

		if (current.items.length > 0) {
			groups.push(current);
		}

		return groups;
	});

	let hasContent = $derived(itemGroups.length > 0 || activeSubPanels.length > 0);
</script>

{#if hasContent}
	<div class="space-y-4">
		{#each itemGroups as group, gi (gi)}
			<!-- Section label -->
			{#if group.label}
				<p class="px-1 text-xs font-semibold tracking-wider text-[var(--sl-text-3)] uppercase {gi > 0 ? 'mt-2' : ''}">
					{group.label}
				</p>
			{/if}

			<!-- Grouped card -->
			<div class="overflow-hidden rounded-xl border border-[var(--sl-border)] bg-[var(--sl-bg-surface)]">
				{#each group.items as item, i (item.key)}
					{@const isLastItem = i === group.items.length - 1 && !subPanelByTrigger[item.key]}
					<SchemaItemRenderer
						{deviceId}
						{item}
						{loadingValues}
						{readonly}
						isLast={isLastItem && !orphanedSubPanels.length}
					/>
					<!-- Inline sub-panel row below its trigger item -->
					{#if subPanelByTrigger[item.key]}
						
						<button
							class="row-press flex w-full items-center justify-between px-4 py-3.5 text-left hover:bg-[var(--sl-bg-subtle)]"
							onclick={() => onSubPanelOpen?.(subPanelByTrigger[item.key]!)}
						>
							<span class="text-sm text-[var(--sl-text-2)]">{subPanelByTrigger[item.key]!.label}</span>
							<ChevronRight size={16} class="text-[var(--sl-text-3)]" />
						</button>
						{#if i < group.items.length - 1 || orphanedSubPanels.length > 0}
							<div class="mx-4 border-b border-[var(--sl-border-muted)]"></div>
						{/if}
					{/if}
				{/each}
				<!-- Orphaned sub-panels (no matching trigger_key in items) -->
				{#each orphanedSubPanels as subPanel, i (subPanel.id)}
					<button
						class="row-press flex w-full items-center justify-between px-4 py-3.5 text-left hover:bg-[var(--sl-bg-subtle)]"
						onclick={() => onSubPanelOpen?.(subPanel)}
					>
						<span class="text-sm text-[var(--sl-text-2)]">{subPanel.label}</span>
						<ChevronRight size={16} class="text-[var(--sl-text-3)]" />
					</button>
					{#if i < orphanedSubPanels.length - 1}
						<div class="mx-4 border-b border-[var(--sl-border-muted)]"></div>
					{/if}
				{/each}
			</div>
		{/each}
	</div>
{:else if loadingValues}
	<div class="overflow-hidden rounded-xl border border-[var(--sl-border)] bg-[var(--sl-bg-surface)]">
		{#each Array(4) as _, i}
			<div class="px-4 py-3">
				<div class="h-4 w-1/3 skeleton-shimmer rounded"></div>
				<div class="mt-1.5 h-3 w-2/3 skeleton-shimmer rounded"></div>
			</div>
			{#if i < 3}
				<div class="mx-4 border-b border-[var(--sl-border-muted)]"></div>
			{/if}
		{/each}
	</div>
{:else}
	<div class="rounded-xl border border-[var(--sl-border)] bg-[var(--sl-bg-surface)] px-4 py-12 text-center">
		<p class="text-sm text-[var(--sl-text-3)]">No settings available for this panel</p>
	</div>
{/if}
