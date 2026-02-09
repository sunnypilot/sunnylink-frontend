<script lang="ts">
	import { decodeParamValue } from '$lib/utils/device';
	import { deviceState } from '$lib/stores/device.svelte';
	import { preferences } from '$lib/stores/preferences.svelte';
	import type { RenderableSetting } from '$lib/types/settings';

	interface Props {
		deviceId: string;
		setting: RenderableSetting;
		value?: any;
		loadingValues?: boolean;
		onJsonClick?: (title: string, content: any) => void;
		onValueChange?: (key: string, value: any, original: any) => void;
	}

	let {
		deviceId,
		setting,
		value = undefined,
		loadingValues = false,
		onJsonClick,
		onValueChange
	}: Props = $props();

	let currentValue = $derived(
		value !== undefined ? value : deviceState.deviceValues[deviceId]?.[setting.key]
	);

	let decodedDefaultValue = $derived.by(() => {
		const def = setting.value?.default_value;
		if (def === undefined || def === null) return undefined;

		if (typeof def === 'string' && setting.value?.type) {
			const decoded = decodeParamValue({
				key: setting.key,
				value: def,
				type: setting.value.type
			});
			return decoded !== null ? decoded : def;
		}
		return def;
	});

	let stagedValue = $derived(deviceState.getChange(deviceId, setting.key));
	let hasStaged = $derived(stagedValue !== undefined);
	let displayValue = $derived(
		hasStaged ? stagedValue : currentValue !== undefined ? currentValue : decodedDefaultValue
	);

	let isBool = $derived(setting.value?.type === 'Bool');
	let isJson = $derived(setting.value?.type === 'Json');
	let isString = $derived(setting.value?.type === 'String');
	let isNumber = $derived(setting.value?.type === 'Int' || setting.value?.type === 'Float');
	let isLoading = $derived(loadingValues && currentValue === undefined);

	let title = $derived(
		setting._extra?.title || (preferences.debugMode ? setting.key : setting.label)
	);
	let description = $derived(setting._extra?.description || setting.description);
	let options = $derived(setting._extra?.options);
	let min = $derived(setting._extra?.min);
	let max = $derived(setting._extra?.max);
	let step = $derived(setting._extra?.step);
	let unit = $derived(setting._extra?.unit);

	function handleChange(newValue: any) {
		let original = currentValue !== undefined ? currentValue : decodedDefaultValue;

		// For booleans, undefined should be treated as false for the original value check
		// to avoid "undefined -> true" showing as a change if it was effectively false (off).
		if (isBool && original === undefined) {
			original = false;
		}

		if (onValueChange) {
			onValueChange(setting.key, newValue, original);
		} else {
			deviceState.stageChange(deviceId, setting.key, newValue, original);
		}
	}
</script>

{#if isBool}
	<button
		class="flex w-full cursor-default flex-col justify-between rounded-xl border bg-[#101a29] p-4 text-left transition-all duration-200 sm:p-6"
		class:border-primary={hasStaged}
		class:border-[#334155]={!hasStaged}
		class:opacity-50={setting.readonly}
		class:cursor-not-allowed={setting.readonly}
		disabled={setting.readonly}
		id={setting.key}
		aria-pressed={displayValue === true}
		aria-disabled={setting.readonly}
		tabindex={setting.readonly ? -1 : 0}
		onclick={() => {
			if (!setting.readonly) {
				const newValue = !displayValue;
				handleChange(newValue);
			}
		}}
	>
		<span class="mb-4 w-full">
			<span class="flex items-start justify-between gap-4">
				<h3 class="min-w-0 flex-1 font-medium break-words text-white">
					{title}
					{#if setting.advanced}
						<span
							class="ml-2 rounded bg-purple-500/20 px-1.5 py-0.5 text-[0.6rem] font-bold tracking-wider text-purple-400 uppercase"
						>
							Advanced
						</span>
					{/if}
					{#if setting.readonly}
						<span
							class="ml-2 rounded bg-amber-500/20 px-1.5 py-0.5 text-[0.6rem] font-bold tracking-wider text-amber-500 uppercase"
						>
							RO
						</span>
					{/if}
					{#if hasStaged}
						<span
							class="ml-2 rounded bg-primary/20 px-1.5 py-0.5 text-[0.6rem] font-bold tracking-wider text-primary uppercase"
						>
							Modified
						</span>
					{/if}
				</h3>
				<span class="text-xs font-bold tracking-wider text-slate-500 uppercase">
					{#if displayValue === true}
						Enabled
					{:else}
						Disabled
					{/if}
				</span>
			</span>
			<p class="mt-1 text-sm text-slate-400">{description}</p>
			{#if (decodedDefaultValue !== undefined && decodedDefaultValue !== null && !isLoading) || unit}
				<p class="mt-2 text-xs text-slate-500">
					{#if decodedDefaultValue !== undefined && decodedDefaultValue !== null && !isLoading}
						Default: {options
							? options.find((o) => String(o.value) === String(decodedDefaultValue))?.label ||
								decodedDefaultValue
							: decodedDefaultValue}
					{/if}
					{#if unit}
						{#if decodedDefaultValue !== undefined && decodedDefaultValue !== null && !isLoading}
							<span class="mx-1.5 opacity-50">|</span>
						{/if}
						<span>Unit: {unit}</span>
					{/if}
				</p>
			{/if}
		</span>

		<span class="mt-auto flex w-full items-end justify-end">
			{#if isLoading}
				<div class="h-8 w-full animate-pulse rounded bg-slate-700"></div>
			{:else}
				<div
					class="relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors"
					class:bg-primary={displayValue === true}
					class:bg-slate-700={displayValue !== true}
				>
					<span
						class="inline-block h-4 w-4 transform rounded-full bg-white transition-transform"
						class:translate-x-6={displayValue === true}
						class:translate-x-1={displayValue !== true}
					></span>
				</div>
			{/if}
		</span>
	</button>
{:else}
	<div
		class="flex flex-col justify-between rounded-xl border bg-[#101a29] p-4 transition-colors hover:border-primary/50 sm:p-6"
		class:border-primary={hasStaged}
		class:border-[#334155]={!hasStaged}
		id={setting.key}
	>
		<div class="mb-4">
			<div class="flex items-start justify-between">
				<h3 class="min-w-0 flex-1 font-medium break-words text-white">
					{title}
					{#if setting.advanced}
						<span
							class="ml-2 rounded bg-purple-500/20 px-1.5 py-0.5 text-[0.6rem] font-bold tracking-wider text-purple-400 uppercase"
						>
							Advanced
						</span>
					{/if}
					{#if setting.readonly}
						<span
							class="ml-2 rounded bg-amber-500/20 px-1.5 py-0.5 text-[0.6rem] font-bold tracking-wider text-amber-500 uppercase"
						>
							RO
						</span>
					{/if}
					{#if hasStaged}
						<span
							class="ml-2 rounded bg-primary/20 px-1.5 py-0.5 text-[0.6rem] font-bold tracking-wider text-primary uppercase"
						>
							Modified
						</span>
					{/if}
				</h3>
			</div>
			<p class="mt-1 text-sm text-slate-400">{description}</p>
			{#if (decodedDefaultValue !== undefined && decodedDefaultValue !== null && !isLoading) || unit}
				<p class="mt-2 text-xs text-slate-500">
					{#if decodedDefaultValue !== undefined && decodedDefaultValue !== null && !isLoading}
						Default: {options
							? options.find((o) => String(o.value) === String(decodedDefaultValue))?.label ||
								decodedDefaultValue
							: isJson
								? '(JSON)'
								: String(decodedDefaultValue).length > 50
									? String(decodedDefaultValue).slice(0, 50) + '...'
									: setting.value?.type === 'Float' && typeof decodedDefaultValue === 'number'
										? decodedDefaultValue.toFixed(2)
										: decodedDefaultValue}
					{/if}
					{#if unit}
						{#if decodedDefaultValue !== undefined && decodedDefaultValue !== null && !isLoading}
							<span class="mx-1.5 opacity-50">|</span>
						{/if}
						<span>Unit: {unit}</span>
					{/if}
				</p>
			{/if}
		</div>

		<div class="mt-auto flex items-end justify-end">
			{#if isLoading}
				<div class="h-8 w-full animate-pulse rounded bg-slate-700"></div>
			{:else if options}
				<select
					class="select w-full bg-[#0f1726] select-sm text-white focus:border-primary focus:outline-none"
					value={displayValue}
					onchange={(e: Event & { currentTarget: HTMLSelectElement }) => {
						const val = e.currentTarget.value;
						let newValue: string | number = val;
						// Try to convert to number if the original type is Int/Float
						if (setting.value?.type === 'Int') newValue = parseInt(val, 10);
						if (setting.value?.type === 'Float') newValue = parseFloat(val);
						handleChange(newValue);
					}}
				>
					{#each options as option}
						<option value={option.value}>{option.label}</option>
					{/each}
				</select>
			{:else if isJson}
				<button
					class="btn w-full text-slate-300 btn-outline btn-sm hover:border-primary hover:text-primary"
					onclick={() => onJsonClick?.(setting.label, displayValue)}
				>
					View JSON
				</button>
			{:else if !setting.readonly && (isString || isNumber)}
				{#if isNumber && min !== undefined && max !== undefined}
					<div class="flex w-full flex-col gap-2">
						<div class="flex items-center justify-between">
							<span class="text-xs font-medium text-slate-400">
								{setting.value?.type === 'Float' && typeof min === 'number' ? min.toFixed(2) : min}
							</span>
							<span class="text-lg font-bold text-primary">
								{#if setting.value?.type === 'Float' && typeof displayValue === 'number'}
									{displayValue.toFixed(2)}
								{:else if setting.value?.type === 'Float' && typeof decodedDefaultValue === 'number'}
									{decodedDefaultValue.toFixed(2)}
								{:else}
									{displayValue !== undefined ? displayValue : decodedDefaultValue || min}
								{/if}
							</span>
							<span class="text-xs font-medium text-slate-400">
								{setting.value?.type === 'Float' && typeof max === 'number' ? max.toFixed(2) : max}
							</span>
						</div>
						<div class="flex items-center gap-4">
							<button
								class="btn btn-circle text-slate-400 btn-ghost btn-sm hover:text-white"
								aria-label="Decrease value"
								onclick={() => {
									let current =
										displayValue !== undefined
											? Number(displayValue)
											: Number(decodedDefaultValue || min);
									let newValue = Math.max(min, current - (step || 1));
									handleChange(newValue);
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
								{min}
								{max}
								step={step || 1}
								value={displayValue !== undefined ? displayValue : decodedDefaultValue || min}
								class="range flex-1 range-primary range-xs"
								oninput={(e: Event & { currentTarget: HTMLInputElement }) => {
									const val = e.currentTarget.value;
									let newValue: string | number = val;
									if (setting.value?.type === 'Int') newValue = parseInt(val, 10);
									if (setting.value?.type === 'Float') newValue = parseFloat(val);
									handleChange(newValue);
								}}
							/>
							<button
								class="btn btn-circle text-slate-400 btn-ghost btn-sm hover:text-white"
								aria-label="Increase value"
								onclick={() => {
									let current =
										displayValue !== undefined
											? Number(displayValue)
											: Number(decodedDefaultValue || min);
									let newValue = Math.min(max, current + (step || 1));
									handleChange(newValue);
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
					<input
						type={isNumber ? 'number' : 'text'}
						value={displayValue !== undefined ? displayValue : ''}
						class="input input-sm w-full bg-[#0f1726] text-white focus:border-primary focus:outline-none"
						placeholder={decodedDefaultValue !== undefined ? String(decodedDefaultValue) : ''}
						{min}
						{max}
						{step}
						oninput={(e: Event & { currentTarget: HTMLInputElement }) => {
							const val = e.currentTarget.value;
							let newValue: string | number = val;
							if (setting.value?.type === 'Int') newValue = parseInt(val, 10);
							if (setting.value?.type === 'Float') newValue = parseFloat(val);
							handleChange(newValue);
						}}
					/>
				{/if}
			{:else if isString && String(displayValue).length > 50}
				<div
					class="max-h-32 w-full overflow-y-auto rounded bg-[#0f1726] p-2 text-xs whitespace-pre-wrap text-slate-300"
				>
					{displayValue}
				</div>
			{:else}
				<div class="w-full rounded bg-[#0f1726] p-2 text-center text-sm font-medium text-white">
					{displayValue !== undefined ? String(displayValue) : '-'}
				</div>
			{/if}
		</div>
	</div>
{/if}
