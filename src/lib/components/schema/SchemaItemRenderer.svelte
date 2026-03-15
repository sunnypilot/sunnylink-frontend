<script lang="ts">
	import { deviceState } from '$lib/stores/device.svelte';
	import { schemaState } from '$lib/stores/schema.svelte';
	import { isVisible, isEnabled, requiresOffroad, type RuleContext } from '$lib/rules/evaluator';
	import type { SchemaItem } from '$lib/types/schema';

	interface Props {
		deviceId: string;
		item: SchemaItem;
		loadingValues?: boolean;
		onValueChange?: (key: string, value: unknown, original: unknown) => void;
	}

	let { deviceId, item, loadingValues = false, onValueChange }: Props = $props();

	// ── Derived state ───────────────────────────────────────────────────────

	let ruleContext: RuleContext = $derived({
		capabilities: schemaState.capabilities[deviceId] ?? null,
		paramValues: deviceState.deviceValues[deviceId] ?? {},
		isOffroad: deviceState.offroadStatuses[deviceId]?.isOffroad ?? true
	});

	let visible = $derived(isVisible(item.visibility, ruleContext));
	let enabled = $derived(isEnabled(item.enablement, ruleContext));
	let needsOffroad = $derived(requiresOffroad(item.enablement));

	let currentValue = $derived(deviceState.deviceValues[deviceId]?.[item.key]);
	let stagedValue = $derived(deviceState.getChange(deviceId, item.key));
	let hasStaged = $derived(stagedValue !== undefined);
	let displayValue: unknown = $derived(
		hasStaged ? stagedValue : currentValue !== undefined ? currentValue : undefined
	);

	let isLoading = $derived(loadingValues && currentValue === undefined);
	let isFloat = $derived(item.step !== undefined && item.step < 1);

	// ── Handlers ────────────────────────────────────────────────────────────

	function handleChange(newValue: unknown) {
		const original = currentValue;
		if (onValueChange) {
			onValueChange(item.key, newValue, original);
		} else {
			deviceState.stageChange(deviceId, item.key, newValue, original);
		}
	}

	function formatDisplay(val: unknown): string {
		if (val === undefined || val === null) return '-';
		if (isFloat && typeof val === 'number') return val.toFixed(2);
		return String(val);
	}
</script>

{#if visible}
	{#if item.widget === 'toggle'}
		<!-- Toggle Widget -->
		<button
			class="relative flex w-full cursor-default flex-col justify-between rounded-xl border bg-[#101a29] p-4 text-left transition-all duration-200 sm:p-6"
			class:border-primary={hasStaged}
			class:border-[#334155]={!hasStaged}
			class:opacity-50={!enabled}
			class:cursor-not-allowed={!enabled}
			disabled={!enabled}
			id={item.key}
			aria-pressed={displayValue === true || displayValue === 1 || displayValue === '1'}
			tabindex={!enabled ? -1 : 0}
			onclick={() => {
				if (enabled) {
					const current =
						displayValue === true || displayValue === 1 || displayValue === '1';
					handleChange(!current);
				}
			}}
		>
			{#if needsOffroad && !ruleContext.isOffroad}
				<div class="absolute top-0 left-6 -translate-y-1/2">
					<div
						class="rounded-full border border-amber-500/50 bg-[#101a29] px-2 py-0.5 text-[0.6rem] font-bold tracking-wider text-amber-400 uppercase"
					>
						Requires Offroad
					</div>
				</div>
			{/if}
			{#if hasStaged}
				<div class="absolute top-0 right-6 -translate-y-1/2">
					<div
						class="rounded-full border border-primary/50 bg-[#101a29] px-2 py-0.5 text-[0.6rem] font-bold tracking-wider text-primary uppercase"
					>
						Modified
					</div>
				</div>
			{/if}
			<span class="mb-4 w-full">
				<span class="flex items-start justify-between gap-4">
					<h3 class="min-w-0 flex-1 font-medium break-words text-white">
						{item.title || item.key}
					</h3>
					<span class="text-xs font-bold tracking-wider text-slate-500 uppercase">
						{#if displayValue === true || displayValue === 1 || displayValue === '1'}
							Enabled
						{:else}
							Disabled
						{/if}
					</span>
				</span>
				{#if item.description}
					<p class="mt-1 text-sm text-slate-400">{item.description}</p>
				{/if}
				{#if item.unit}
					<p class="mt-2 text-xs text-slate-500">Unit: {item.unit}</p>
				{/if}
			</span>
			<span class="mt-auto flex w-full items-end justify-end">
				{#if isLoading}
					<div class="h-8 w-full animate-pulse rounded bg-slate-700"></div>
				{:else}
					<div
						class="relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors"
						class:bg-primary={displayValue === true ||
							displayValue === 1 ||
							displayValue === '1'}
						class:bg-slate-700={!(
							displayValue === true ||
							displayValue === 1 ||
							displayValue === '1'
						)}
					>
						<span
							class="inline-block h-4 w-4 transform rounded-full bg-white transition-transform"
							class:translate-x-6={displayValue === true ||
								displayValue === 1 ||
								displayValue === '1'}
							class:translate-x-1={!(
								displayValue === true ||
								displayValue === 1 ||
								displayValue === '1'
							)}
						></span>
					</div>
				{/if}
			</span>
		</button>
	{:else if item.widget === 'option'}
		<!-- Option Widget (slider/stepper) -->
		<div
			class="relative flex flex-col justify-between rounded-xl border bg-[#101a29] p-4 transition-colors sm:p-6"
			class:border-primary={hasStaged}
			class:border-[#334155]={!hasStaged}
			class:opacity-50={!enabled}
			id={item.key}
		>
			{#if needsOffroad && !ruleContext.isOffroad}
				<div class="absolute top-0 left-6 -translate-y-1/2">
					<div
						class="rounded-full border border-amber-500/50 bg-[#101a29] px-2 py-0.5 text-[0.6rem] font-bold tracking-wider text-amber-400 uppercase"
					>
						Requires Offroad
					</div>
				</div>
			{/if}
			{#if hasStaged}
				<div class="absolute top-0 right-6 -translate-y-1/2">
					<div
						class="rounded-full border border-primary/50 bg-[#101a29] px-2 py-0.5 text-[0.6rem] font-bold tracking-wider text-primary uppercase"
					>
						Modified
					</div>
				</div>
			{/if}
			<div class="mb-4">
				<h3 class="font-medium text-white">{item.title || item.key}</h3>
				{#if item.description}
					<p class="mt-1 text-sm text-slate-400">{item.description}</p>
				{/if}
				{#if item.unit}
					<p class="mt-2 text-xs text-slate-500">Unit: {item.unit}</p>
				{/if}
			</div>
			<div class="mt-auto flex items-end justify-end">
				{#if isLoading}
					<div class="h-8 w-full animate-pulse rounded bg-slate-700"></div>
				{:else if item.options}
					<!-- Options as dropdown select -->
					<select
						class="select w-full bg-[#0f1726] select-sm text-white focus:border-primary focus:outline-none"
						value={displayValue}
						disabled={!enabled}
						onchange={(e) => {
							const val = (e.currentTarget as HTMLSelectElement).value;
							const numVal = Number(val);
							handleChange(isNaN(numVal) ? val : numVal);
						}}
					>
						{#each item.options as option}
							<option value={option.value}>{option.label}</option>
						{/each}
					</select>
				{:else if item.min !== undefined && item.max !== undefined}
					<!-- Range slider -->
					<div class="flex w-full flex-col gap-2">
						<div class="flex items-center justify-between">
							<span class="text-xs font-medium text-slate-400">
								{isFloat ? Number(item.min).toFixed(2) : item.min}
							</span>
							<span class="text-lg font-bold text-primary">
								{formatDisplay(displayValue !== undefined ? displayValue : item.min)}
							</span>
							<span class="text-xs font-medium text-slate-400">
								{isFloat ? Number(item.max).toFixed(2) : item.max}
							</span>
						</div>
						<div class="flex items-center gap-4">
							<button
								class="btn btn-circle text-slate-400 btn-ghost btn-sm hover:text-white"
								aria-label="Decrease value"
								disabled={!enabled}
								onclick={() => {
									const current =
										displayValue !== undefined ? Number(displayValue) : Number(item.min);
									const newValue = Math.max(item.min!, current - (item.step || 1));
									handleChange(isFloat ? parseFloat(newValue.toFixed(2)) : newValue);
								}}
							>
								<svg
									xmlns="http://www.w3.org/2000/svg"
									width="20"
									height="20"
									viewBox="0 0 24 24"
									fill="none"
									stroke="currentColor"
									stroke-width="2"
									stroke-linecap="round"
									stroke-linejoin="round"><path d="M5 12h14" /></svg
								>
							</button>
							<input
								type="range"
								min={item.min}
								max={item.max}
								step={item.step || 1}
								value={displayValue !== undefined ? Number(displayValue) : item.min}
								class="range flex-1 range-primary range-xs"
								disabled={!enabled}
								oninput={(e) => {
									const val = (e.currentTarget as HTMLInputElement).value;
									const numVal = isFloat ? parseFloat(val) : parseInt(val, 10);
									handleChange(numVal);
								}}
							/>
							<button
								class="btn btn-circle text-slate-400 btn-ghost btn-sm hover:text-white"
								aria-label="Increase value"
								disabled={!enabled}
								onclick={() => {
									const current =
										displayValue !== undefined ? Number(displayValue) : Number(item.min);
									const newValue = Math.min(item.max!, current + (item.step || 1));
									handleChange(isFloat ? parseFloat(newValue.toFixed(2)) : newValue);
								}}
							>
								<svg
									xmlns="http://www.w3.org/2000/svg"
									width="20"
									height="20"
									viewBox="0 0 24 24"
									fill="none"
									stroke="currentColor"
									stroke-width="2"
									stroke-linecap="round"
									stroke-linejoin="round"><path d="M5 12h14" /><path d="M12 5v14" /></svg
								>
							</button>
						</div>
					</div>
				{:else}
					<!-- Plain text display -->
					<div class="w-full rounded bg-[#0f1726] p-2 text-center text-sm font-medium text-white">
						{formatDisplay(displayValue)}
					</div>
				{/if}
			</div>
		</div>
	{:else if item.widget === 'multiple_button'}
		<!-- Multiple Button Widget -->
		<div
			class="relative flex flex-col justify-between rounded-xl border bg-[#101a29] p-4 transition-colors sm:p-6"
			class:border-primary={hasStaged}
			class:border-[#334155]={!hasStaged}
			class:opacity-50={!enabled}
			id={item.key}
		>
			{#if needsOffroad && !ruleContext.isOffroad}
				<div class="absolute top-0 left-6 -translate-y-1/2">
					<div
						class="rounded-full border border-amber-500/50 bg-[#101a29] px-2 py-0.5 text-[0.6rem] font-bold tracking-wider text-amber-400 uppercase"
					>
						Requires Offroad
					</div>
				</div>
			{/if}
			{#if hasStaged}
				<div class="absolute top-0 right-6 -translate-y-1/2">
					<div
						class="rounded-full border border-primary/50 bg-[#101a29] px-2 py-0.5 text-[0.6rem] font-bold tracking-wider text-primary uppercase"
					>
						Modified
					</div>
				</div>
			{/if}
			<div class="mb-4">
				<h3 class="font-medium text-white">{item.title || item.key}</h3>
				{#if item.description}
					<p class="mt-1 text-sm text-slate-400">{item.description}</p>
				{/if}
			</div>
			<div class="mt-auto">
				{#if isLoading}
					<div class="h-8 w-full animate-pulse rounded bg-slate-700"></div>
				{:else if item.options}
					<div class="flex flex-wrap gap-2">
						{#each item.options as option}
							{@const isSelected = String(displayValue) === String(option.value)}
							<button
								class="btn btn-sm flex-1 min-w-[4rem] transition-colors"
								class:btn-primary={isSelected}
								class:btn-ghost={!isSelected}
								class:border-[#334155]={!isSelected}
								disabled={!enabled}
								onclick={() => handleChange(option.value)}
							>
								{option.label}
							</button>
						{/each}
					</div>
				{/if}
			</div>
		</div>
	{:else if item.widget === 'info'}
		<!-- Info Widget (read-only display) -->
		<div
			class="flex flex-col rounded-xl border border-[#334155] bg-[#101a29] p-4 sm:p-6"
			id={item.key}
		>
			<h3 class="font-medium text-white">{item.title || item.key}</h3>
			{#if item.description}
				<p class="mt-1 text-sm text-slate-400">{item.description}</p>
			{/if}
			<div class="mt-3 w-full rounded bg-[#0f1726] p-2 text-center text-sm font-medium text-white">
				{formatDisplay(displayValue)}
			</div>
		</div>
	{/if}

	<!-- Render sub_items inline -->
	{#if item.sub_items}
		{#each item.sub_items as subItem (subItem.key)}
			<svelte:self deviceId={deviceId} item={subItem} {loadingValues} {onValueChange} />
		{/each}
	{/if}
{/if}
