<script lang="ts">
	import SchemaItemRenderer from './SchemaItemRenderer.svelte';
	import { schemaState } from '$lib/stores/schema.svelte';
	import { deviceState } from '$lib/stores/device.svelte';
	import { isVisible, evaluateRule, type RuleContext } from '$lib/rules/evaluator';
	import type { Panel, SubPanel, SchemaItem } from '$lib/types/schema';

	interface Props {
		deviceId: string;
		panel: Panel;
		loadingValues?: boolean;
		onValueChange?: (key: string, value: unknown, original: unknown) => void;
		onSubPanelOpen?: (subPanel: SubPanel) => void;
	}

	let {
		deviceId,
		panel,
		loadingValues = false,
		onValueChange,
		onSubPanelOpen
	}: Props = $props();

	let ruleContext: RuleContext = $derived({
		capabilities: schemaState.capabilities[deviceId] ?? null,
		paramValues: deviceState.deviceValues[deviceId] ?? {},
		isOffroad: deviceState.offroadStatuses[deviceId]?.isOffroad ?? true
	});

	// Filter items to only visible ones
	let visibleItems: SchemaItem[] = $derived(
		panel.items.filter((item) => isVisible(item.visibility, ruleContext))
	);

	// Filter sub-panels to those whose trigger condition is met
	let activeSubPanels: SubPanel[] = $derived(
		(panel.sub_panels ?? []).filter((sp) => {
			if (!sp.trigger_condition) return true;
			return evaluateRule(sp.trigger_condition, ruleContext);
		})
	);
</script>

{#if visibleItems.length > 0 || activeSubPanels.length > 0}
	<div class="flex flex-col gap-4">
		<!-- Panel items -->
		{#each visibleItems as item (item.key)}
			<SchemaItemRenderer {deviceId} {item} {loadingValues} {onValueChange} />
		{/each}

		<!-- Sub-panel navigation buttons -->
		{#if activeSubPanels.length > 0}
			<div class="mt-2 flex flex-col gap-2">
				{#each activeSubPanels as subPanel (subPanel.id)}
					<button
						class="flex w-full items-center justify-between rounded-xl border border-[#334155] bg-[#101a29] p-4 text-left transition-colors hover:border-primary/50 sm:p-6"
						onclick={() => onSubPanelOpen?.(subPanel)}
					>
						<span class="font-medium text-white">{subPanel.label}</span>
						<svg
							xmlns="http://www.w3.org/2000/svg"
							width="20"
							height="20"
							viewBox="0 0 24 24"
							fill="none"
							stroke="currentColor"
							stroke-width="2"
							stroke-linecap="round"
							stroke-linejoin="round"
							class="text-slate-400"
						>
							<path d="m9 18 6-6-6-6" />
						</svg>
					</button>
				{/each}
			</div>
		{/if}
	</div>
{:else if loadingValues}
	<div class="flex flex-col gap-4">
		{#each Array(3) as _}
			<div class="h-24 animate-pulse rounded-xl bg-[#101a29]"></div>
		{/each}
	</div>
{:else}
	<div class="rounded-xl border border-[#334155] bg-[#101a29] p-8 text-center">
		<p class="text-sm text-slate-500">No settings available for this panel</p>
	</div>
{/if}
