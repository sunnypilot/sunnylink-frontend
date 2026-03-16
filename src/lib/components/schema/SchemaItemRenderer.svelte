<script lang="ts">
	import { deviceState } from '$lib/stores/device.svelte';
	import { schemaState } from '$lib/stores/schema.svelte';
	import { isVisible, isEnabled, requiresOffroad, type RuleContext } from '$lib/rules/evaluator';
	import { setDeviceParams } from '$lib/api/device';
	import { encodeParamValue } from '$lib/utils/device';
	import { logtoClient } from '$lib/logto/auth.svelte';
	import type { SchemaItem } from '$lib/types/schema';

	interface Props {
		deviceId: string;
		item: SchemaItem;
		loadingValues?: boolean;
	}

	let { deviceId, item, loadingValues = false }: Props = $props();

	// ── Push state per item ─────────────────────────────────────────────────

	type PushState = 'idle' | 'pushing' | 'success' | 'error';
	let pushState = $state<PushState>('idle');
	let pushError = $state('');

	// ── Derived state ───────────────────────────────────────────────────────

	let ruleContext: RuleContext = $derived({
		capabilities: schemaState.capabilities[deviceId] ?? null,
		paramValues: deviceState.deviceValues[deviceId] ?? {},
		isOffroad: deviceState.offroadStatuses[deviceId]?.isOffroad ?? true
	});

	let visible = $derived(isVisible(item.visibility, ruleContext));
	let enabled = $derived(isEnabled(item.enablement, ruleContext));
	let needsOffroad = $derived(requiresOffroad(item.enablement));
	let isPushing = $derived(pushState === 'pushing');

	let currentValue = $derived(deviceState.deviceValues[deviceId]?.[item.key]);
	let displayValue: unknown = $derived(
		currentValue !== undefined ? currentValue : undefined
	);

	let isLoading = $derived(loadingValues && currentValue === undefined);
	let isFloat = $derived(item.step !== undefined && item.step < 1);
	let isOn = $derived(displayValue === true || displayValue === 1 || displayValue === '1');

	// ── Immediate push ──────────────────────────────────────────────────────

	function inferParamType(): string {
		// Check device-reported type first
		const deviceParams = deviceState.deviceSettings[deviceId];
		if (deviceParams) {
			const paramInfo = deviceParams.find((p) => p.key === item.key);
			if (paramInfo?.type) return paramInfo.type;
		}
		// Infer from widget type
		if (item.widget === 'toggle') return 'Bool';
		if (item.widget === 'option' && isFloat) return 'Float';
		if (item.widget === 'option') return 'Int';
		if (item.widget === 'multiple_button') return 'Int';
		return 'String';
	}

	async function pushValue(newValue: unknown) {
		if (!logtoClient) return;

		// Optimistically update local state
		if (!deviceState.deviceValues[deviceId]) {
			deviceState.deviceValues[deviceId] = {};
		}
		const previousValue = deviceState.deviceValues[deviceId][item.key];
		deviceState.deviceValues[deviceId][item.key] = newValue;

		pushState = 'pushing';
		pushError = '';

		try {
			const token = await logtoClient.getIdToken();
			if (!token) throw new Error('No auth token');

			const paramType = inferParamType();
			const encoded = encodeParamValue({ key: item.key, value: newValue, type: paramType });
			if (encoded === null) throw new Error('Failed to encode value');

			await setDeviceParams(deviceId, [{ key: item.key, value: encoded }], token, 10000);

			pushState = 'success';
			setTimeout(() => {
				if (pushState === 'success') pushState = 'idle';
			}, 1500);
		} catch (e) {
			// Revert optimistic update
			deviceState.deviceValues[deviceId][item.key] = previousValue;
			pushState = 'error';
			pushError = (e as Error)?.message || 'Failed to save';
			setTimeout(() => {
				if (pushState === 'error') pushState = 'idle';
			}, 3000);
		}
	}

	function handleChange(newValue: unknown) {
		pushValue(newValue);
	}

	let borderClass = $derived(
		pushState === 'success'
			? 'border-emerald-500'
			: pushState === 'error'
				? 'border-red-500'
				: 'border-slate-700'
	);

	function formatDisplay(val: unknown): string {
		if (val === undefined || val === null) return '-';
		if (isFloat && typeof val === 'number') return val.toFixed(2);
		return String(val);
	}
</script>

{#if visible}
	{#if item.widget === 'toggle'}
		<button
			class="group relative flex w-full items-center justify-between rounded-xl border bg-[#101a29] px-4 py-3 text-left transition-all duration-200 {borderClass}"
			class:opacity-50={!enabled || isPushing}
			class:cursor-not-allowed={!enabled}
			disabled={!enabled || isPushing}
			id={item.key}
			aria-pressed={isOn}
			tabindex={!enabled ? -1 : 0}
			onclick={() => {
				if (enabled && !isPushing) handleChange(!isOn);
			}}
		>
			<div class="mr-4 min-w-0 flex-1">
				<div class="flex items-center gap-2">
					<h3 class="font-medium text-white">{item.title || item.key}</h3>
					{#if needsOffroad && !ruleContext.isOffroad}
						<span class="rounded bg-amber-500/20 px-1.5 py-0.5 text-[0.55rem] font-bold tracking-wider text-amber-400 uppercase">
							Offroad
						</span>
					{/if}
				</div>
				{#if item.description}
					<p class="mt-0.5 text-sm text-slate-400">{item.description}</p>
				{/if}
				{#if pushState === 'error'}
					<p class="mt-0.5 text-xs text-red-400">{pushError}</p>
				{/if}
			</div>
			<div class="flex shrink-0 items-center gap-2">
				{#if isPushing}
					<span class="loading loading-spinner loading-xs text-primary"></span>
				{:else if pushState === 'success'}
					<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none"
						stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"
						class="text-emerald-400 transition-opacity"><path d="M20 6 9 17l-5-5" /></svg>
				{/if}
				{#if isLoading}
					<div class="h-6 w-11 animate-pulse rounded-full bg-slate-700"></div>
				{:else}
					<div
						class="relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors duration-200"
						class:bg-primary={isOn}
						class:bg-slate-700={!isOn}
					>
						<span
							class="inline-block h-4 w-4 transform rounded-full bg-white transition-transform duration-200"
							class:translate-x-6={isOn}
							class:translate-x-1={!isOn}
						></span>
					</div>
				{/if}
			</div>
		</button>

	{:else if item.widget === 'option'}
		<div
			class="relative rounded-xl border bg-[#101a29] px-4 py-3 transition-all duration-200 {borderClass}"
			class:opacity-50={!enabled || isPushing}
			id={item.key}
		>
			<div class="mb-3">
				<div class="flex items-center gap-2">
					<h3 class="font-medium text-white">{item.title || item.key}</h3>
					{#if isPushing}
						<span class="loading loading-spinner loading-xs text-primary"></span>
					{:else if pushState === 'success'}
						<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none"
							stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"
							class="text-emerald-400"><path d="M20 6 9 17l-5-5" /></svg>
					{/if}
					{#if needsOffroad && !ruleContext.isOffroad}
						<span class="rounded bg-amber-500/20 px-1.5 py-0.5 text-[0.55rem] font-bold tracking-wider text-amber-400 uppercase">
							Offroad
						</span>
					{/if}
				</div>
				{#if item.description}
					<p class="mt-0.5 text-sm text-slate-400">{item.description}</p>
				{/if}
				{#if pushState === 'error'}
					<p class="mt-0.5 text-xs text-red-400">{pushError}</p>
				{/if}
			</div>
			{#if isLoading}
				<div class="h-8 w-full animate-pulse rounded bg-slate-700"></div>
			{:else if item.options}
				<select
					class="select w-full bg-[#0f1726] select-sm text-white focus:border-primary focus:outline-none"
					value={displayValue}
					disabled={!enabled || isPushing}
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
					<div class="flex items-center gap-3">
						<button
							class="btn btn-circle text-slate-400 btn-ghost btn-xs hover:text-white"
							disabled={!enabled || isPushing}
							onclick={() => {
								const current = displayValue !== undefined ? Number(displayValue) : Number(item.min);
								const nv = Math.max(item.min!, current - (item.step || 1));
								handleChange(isFloat ? parseFloat(nv.toFixed(2)) : nv);
							}}
						>
							<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none"
								stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14" /></svg>
						</button>
						<input
							type="range"
							min={item.min}
							max={item.max}
							step={item.step || 1}
							value={displayValue !== undefined ? Number(displayValue) : item.min}
							class="range flex-1 range-primary range-xs"
							disabled={!enabled || isPushing}
							onchange={(e) => {
								const val = (e.currentTarget as HTMLInputElement).value;
								const numVal = isFloat ? parseFloat(val) : parseInt(val, 10);
								handleChange(numVal);
							}}
						/>
						<button
							class="btn btn-circle text-slate-400 btn-ghost btn-xs hover:text-white"
							disabled={!enabled || isPushing}
							onclick={() => {
								const current = displayValue !== undefined ? Number(displayValue) : Number(item.min);
								const nv = Math.min(item.max!, current + (item.step || 1));
								handleChange(isFloat ? parseFloat(nv.toFixed(2)) : nv);
							}}
						>
							<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none"
								stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14" /><path d="M12 5v14" /></svg>
						</button>
					</div>
				</div>
			{:else}
				<div class="w-full rounded bg-[#0f1726] p-2 text-center text-sm font-medium text-white">
					{formatDisplay(displayValue)}
				</div>
			{/if}
		</div>

	{:else if item.widget === 'multiple_button'}
		<div
			class="relative rounded-xl border bg-[#101a29] px-4 py-3 transition-all duration-200 {borderClass}"
			class:opacity-50={!enabled || isPushing}
			id={item.key}
		>
			<div class="mb-3">
				<div class="flex items-center gap-2">
					<h3 class="font-medium text-white">{item.title || item.key}</h3>
					{#if isPushing}
						<span class="loading loading-spinner loading-xs text-primary"></span>
					{:else if pushState === 'success'}
						<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none"
							stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"
							class="text-emerald-400"><path d="M20 6 9 17l-5-5" /></svg>
					{/if}
					{#if needsOffroad && !ruleContext.isOffroad}
						<span class="rounded bg-amber-500/20 px-1.5 py-0.5 text-[0.55rem] font-bold tracking-wider text-amber-400 uppercase">
							Offroad
						</span>
					{/if}
				</div>
				{#if item.description}
					<p class="mt-0.5 text-sm text-slate-400">{item.description}</p>
				{/if}
				{#if pushState === 'error'}
					<p class="mt-0.5 text-xs text-red-400">{pushError}</p>
				{/if}
			</div>
			{#if isLoading}
				<div class="h-8 w-full animate-pulse rounded bg-slate-700"></div>
			{:else if item.options}
				<div class="flex flex-wrap gap-1.5">
					{#each item.options as option}
						{@const isSelected = String(displayValue) === String(option.value)}
						<button
							class="btn btn-xs flex-1 min-w-[3rem] transition-colors"
							class:btn-primary={isSelected}
							class:btn-ghost={!isSelected}
							class:border-[#334155]={!isSelected}
							disabled={!enabled || isPushing}
							onclick={() => handleChange(option.value)}
						>
							{option.label}
						</button>
					{/each}
				</div>
			{/if}
		</div>

	{:else if item.widget === 'info'}
		<div
			class="rounded-xl border border-[#334155] bg-[#101a29] px-4 py-3"
			id={item.key}
		>
			<h3 class="font-medium text-white">{item.title || item.key}</h3>
			{#if item.description}
				<p class="mt-0.5 text-sm text-slate-400">{item.description}</p>
			{/if}
			<div class="mt-2 w-full rounded bg-[#0f1726] p-2 text-center text-sm font-medium text-white">
				{formatDisplay(displayValue)}
			</div>
		</div>
	{/if}

	{#if item.sub_items}
		{#each item.sub_items as subItem (subItem.key)}
			<svelte:self deviceId={deviceId} item={subItem} {loadingValues} />
		{/each}
	{/if}
{/if}
