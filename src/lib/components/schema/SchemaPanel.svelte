<script lang="ts">
	import SchemaItemRenderer from './SchemaItemRenderer.svelte';
	import { schemaState } from '$lib/stores/schema.svelte';
	import { deviceState } from '$lib/stores/device.svelte';
	import { isVisible, isEnabled, evaluateRule, evaluateRules, getDisabledReasons, type RuleContext } from '$lib/rules/evaluator';
	import type { Panel, PanelSection, SubPanel, SchemaItem } from '$lib/types/schema';
	import { ChevronRight } from 'lucide-svelte';
	import Tooltip from '$lib/components/Tooltip.svelte';

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

	let useSections = $derived(!!(panel.sections && panel.sections.length > 0));

	/** All sub-panels (never filtered — dim instead of hide) */
	let allSubPanels: SubPanel[] = $derived(panel.sub_panels ?? []);

	/** Check if a V1 sub-panel's trigger condition is met */
	function isV1SubPanelEnabled(sp: SubPanel): boolean {
		if (!sp.trigger_condition) return true;
		return evaluateRule(sp.trigger_condition, ruleContext);
	}

	let subPanelByTrigger: Record<string, SubPanel> = $derived.by(() => {
		const map: Record<string, SubPanel> = {};
		for (const sp of allSubPanels) {
			map[sp.trigger_key] = sp;
		}
		return map;
	});

	let orphanedSubPanels: SubPanel[] = $derived.by(() => {
		const itemKeys = new Set((panel.items ?? []).map((i) => i.key));
		return allSubPanels.filter((sp) => !itemKeys.has(sp.trigger_key));
	});

	// Group flat items into sections (legacy inference from info widgets)
	type ItemGroup = { label?: string; items: SchemaItem[] };

	function isSectionHeader(item: SchemaItem): boolean {
		if (item.widget === 'info' && !item.options) return true;
		if (item.widget === 'multiple_button' && (!item.options || item.options.length === 0)) return true;
		return false;
	}

	let itemGroups: ItemGroup[] = $derived.by(() => {
		const groups: ItemGroup[] = [];
		let current: ItemGroup = { items: [] };

		for (const item of panel.items ?? []) {
			if (isSectionHeader(item) && isVisible(item.visibility, ruleContext)) {
				if (current.items.length > 0) groups.push(current);
				current = { label: item.title || item.key, items: [] };
			} else {
				current.items.push(item);
			}
		}
		if (current.items.length > 0) groups.push(current);
		return groups;
	});

	// Sort sections by order field (if present), preserving array order as fallback
	let orderedSections = $derived.by(() => {
		if (!panel.sections) return [];
		return [...panel.sections].sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
	});

	let hasContent = $derived(
		useSections ? orderedSections.length > 0 :
		itemGroups.length > 0 || allSubPanels.length > 0
	);

	/** All sub-panels for a section (never filtered out — dim instead of hide) */
	function getAllSectionSubPanels(section: PanelSection): SubPanel[] {
		return section.sub_panels ?? [];
	}

	/** Check if a sub-panel's trigger condition is met (enabled) */
	function isSubPanelEnabled(sp: SubPanel, section?: PanelSection): boolean {
		// If the parent section is disabled, sub-panel is also disabled
		if (section && !isSectionEnabled(section)) return false;
		if (!sp.trigger_condition) return true;
		return evaluateRule(sp.trigger_condition, ruleContext);
	}

	/** Check if a section's enablement rules are satisfied */
	function isSectionEnabled(section: PanelSection): boolean {
		return evaluateRules(section.enablement, ruleContext);
	}

	/** Get human-readable reasons why a section is disabled */
	function getSectionDisabledReasons(section: PanelSection): string[] {
		const schema = schemaState.schemas[deviceId];
		const capLabels = schema?.capability_labels;
		return getDisabledReasons(section.enablement, ruleContext, undefined, capLabels);
	}

	function getSectionSubPanelByTrigger(section: PanelSection): Record<string, SubPanel> {
		const map: Record<string, SubPanel> = {};
		for (const sp of getAllSectionSubPanels(section)) {
			map[sp.trigger_key] = sp;
		}
		return map;
	}
</script>

{#if hasContent}
	<div>
		{#if useSections}
			<!-- ═══ V2: Sections-based rendering ═══ -->
			{#each orderedSections as section, si (section.id)}
				{@const sectionEnabled = isSectionEnabled(section)}
				{@const sectionReasons = sectionEnabled ? [] : getSectionDisabledReasons(section)}
				<!-- 48px between sections (Linear: card bottom → next section title), 0 for first -->
				<div class:mt-12={si > 0}>
				<!-- Section title + description -->
				{#if section.title}
					<div class="px-4 transition-opacity duration-150" class:setting-dimmed={!sectionEnabled}>
						<div class="flex items-center gap-2">
							<p class="text-[0.9375rem] font-medium text-[var(--sl-text-1)]">{section.title}</p>
							{#if !sectionEnabled && sectionReasons.length > 0}
								<Tooltip text={sectionReasons.join('. ')}>
									<span class="bright-badge rounded-md bg-amber-500/15 px-1.5 py-0.5 text-[0.6rem] font-semibold tracking-wider text-amber-700 dark:text-amber-400 uppercase">Unavailable</span>
								</Tooltip>
							{/if}
						</div>
						{#if section.description}
							<!-- 7px title→desc (Linear), mt-2 = 8px closest match -->
							<p class="mt-2 text-[0.8125rem] font-[450] text-[var(--sl-text-2)]">{section.description}</p>
						{/if}
					</div>
				{/if}

				{#if section.items.length > 0 || getAllSectionSubPanels(section).length > 0}
					{@const spMap = getSectionSubPanelByTrigger(section)}
					{@const orphans = getAllSectionSubPanels(section).filter(sp => !section.items.some(i => i.key === sp.trigger_key))}
					<!-- 12px title→card (Linear: ~13px) -->
					<div class="mt-3 overflow-hidden rounded-xl border border-[var(--sl-border)] bg-[var(--sl-bg-surface)]">
						{#each section.items as item, i (item.key)}
							<SchemaItemRenderer
								{deviceId}
								{item}
								{loadingValues}
								{readonly}
								isLast={i === section.items.length - 1 && !spMap[item.key] && orphans.length === 0}
							/>
							{#if spMap[item.key] !== undefined}
								{@const spEnabled = isSubPanelEnabled(spMap[item.key]!, section)}
								<button
									class="row-press flex w-full items-center justify-between px-4 py-3.5 text-left transition-opacity duration-150"
									class:hover:bg-[var(--sl-bg-subtle)]={spEnabled}
									class:opacity-[0.4]={!spEnabled}
									disabled={!spEnabled}
									onclick={() => { const s = spMap[item.key]; if (s) onSubPanelOpen?.(s); }}
								>
									<span class="text-[0.8125rem] font-medium text-[var(--sl-text-1)]">{spMap[item.key]?.label}</span>
									<ChevronRight size={16} class="text-[var(--sl-text-3)]" />
								</button>
								{#if i < section.items.length - 1 || orphans.length > 0}
									<div class="mx-4 border-b border-[var(--sl-border-muted)]"></div>
								{/if}
							{/if}
						{/each}
						{#each orphans as subPanel, i (subPanel.id)}
							{@const spEnabled = isSubPanelEnabled(subPanel, section)}
							<button
								class="row-press flex w-full items-center justify-between px-4 py-3.5 text-left transition-opacity duration-150"
								class:hover:bg-[var(--sl-bg-subtle)]={spEnabled}
								class:opacity-[0.4]={!spEnabled}
								disabled={!spEnabled}
								onclick={() => onSubPanelOpen?.(subPanel)}
							>
								<span class="text-[0.8125rem] font-medium text-[var(--sl-text-1)]">{subPanel.label}</span>
								<ChevronRight size={16} class="text-[var(--sl-text-3)]" />
							</button>
							{#if i < orphans.length - 1}
								<div class="mx-4 border-b border-[var(--sl-border-muted)]"></div>
							{/if}
						{/each}
					</div>
				{/if}
				</div>
			{/each}
		{:else}
			<!-- ═══ V1: Legacy flat items rendering ═══ -->
			{#each itemGroups as group, gi (gi)}
				<div class:mt-12={gi > 0 && group.label} class:mt-3={gi > 0 && !group.label}>
				{#if group.label}
					<div class="px-4">
						<p class="text-[0.9375rem] font-medium text-[var(--sl-text-1)]">{group.label}</p>
					</div>
				{/if}

				<div class="mt-3 overflow-hidden rounded-xl border border-[var(--sl-border)] bg-[var(--sl-bg-surface)]">
					{#each group.items as item, i (item.key)}
						{@const isLastItem = i === group.items.length - 1 && !subPanelByTrigger[item.key]}
						<SchemaItemRenderer
							{deviceId}
							{item}
							{loadingValues}
							{readonly}
							isLast={isLastItem && !orphanedSubPanels.length}
						/>
						{#if subPanelByTrigger[item.key] !== undefined}
							{@const spEnabled = isV1SubPanelEnabled(subPanelByTrigger[item.key]!)}
							<button
								class="row-press flex w-full items-center justify-between px-4 py-3.5 text-left transition-opacity duration-150"
								class:hover:bg-[var(--sl-bg-subtle)]={spEnabled}
								class:opacity-[0.4]={!spEnabled}
																disabled={!spEnabled}
								onclick={() => { const s = subPanelByTrigger[item.key]; if (s) onSubPanelOpen?.(s); }}
							>
								<span class="text-[0.8125rem] font-medium text-[var(--sl-text-1)]">{subPanelByTrigger[item.key]?.label}</span>
								<ChevronRight size={16} class="text-[var(--sl-text-3)]" />
							</button>
							{#if i < group.items.length - 1 || orphanedSubPanels.length > 0}
								<div class="mx-4 border-b border-[var(--sl-border-muted)]"></div>
							{/if}
						{/if}
					{/each}
					{#each orphanedSubPanels as subPanel, i (subPanel.id)}
						{@const spEnabled = isV1SubPanelEnabled(subPanel)}
						<button
							class="row-press flex w-full items-center justify-between px-4 py-3.5 text-left transition-opacity duration-150"
							class:hover:bg-[var(--sl-bg-subtle)]={spEnabled}
							class:opacity-[0.4]={!spEnabled}
														disabled={!spEnabled}
							onclick={() => onSubPanelOpen?.(subPanel)}
						>
							<span class="text-[0.8125rem] font-medium text-[var(--sl-text-1)]">{subPanel.label}</span>
							<ChevronRight size={16} class="text-[var(--sl-text-3)]" />
						</button>
						{#if i < orphanedSubPanels.length - 1}
							<div class="mx-4 border-b border-[var(--sl-border-muted)]"></div>
						{/if}
					{/each}
				</div>
				</div>
			{/each}
		{/if}
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
		<p class="text-[0.8125rem] font-[450] text-[var(--sl-text-3)]">No settings available for this panel</p>
	</div>
{/if}
