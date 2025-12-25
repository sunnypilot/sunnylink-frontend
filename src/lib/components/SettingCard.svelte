<script lang="ts">
	import { deviceState } from '$lib/stores/device.svelte';
	import { preferences } from '$lib/stores/preferences.svelte';
	import type { RenderableSetting } from '$lib/types/settings';
	import { Star } from 'lucide-svelte';

	let {
		setting,
		deviceId,
		loadingValues = false
	}: {
		setting: RenderableSetting;
		deviceId: string;
		loadingValues?: boolean;
	} = $props();

	let currentValue = $derived(deviceState.deviceValues[deviceId]?.[setting.key]);
	let stagedValue = $derived(deviceState.getChange(deviceId, setting.key));
	let hasStaged = $derived(stagedValue !== undefined);
	let displayValue = $derived(
		hasStaged
			? stagedValue
			: currentValue !== undefined
				? currentValue
				: setting.value?.default_value
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

	let isFavorite = $derived(preferences.isFavorite(setting.key));

	function toggleFavorite(e: Event) {
		e.stopPropagation();
		preferences.toggleFavorite(setting.key);
	}
</script>

{#if isBool}
	<div
		class="relative flex w-full cursor-default flex-col justify-between rounded-xl border bg-[#101a29] p-4 text-left transition-all duration-200 sm:p-6"
		class:border-primary={hasStaged}
		class:border-[#334155]={!hasStaged}
		class:opacity-50={setting.readonly}
		class:cursor-not-allowed={setting.readonly}
		class:focus-visible:ring-2={!setting.readonly}
		class:focus-visible:ring-primary={!setting.readonly}
		role="button"
		id={setting.key}
		aria-pressed={displayValue === true}
		aria-disabled={setting.readonly}
		tabindex={setting.readonly ? -1 : 0}
		onkeydown={(e) => {
			if (e.key === 'Enter' || e.key === ' ') {
				e.preventDefault();
				if (!setting.readonly) {
					const newValue = !displayValue;
					let original = currentValue !== undefined ? currentValue : setting.value?.default_value;

					if (isBool && original === undefined) {
						original = false;
					}

					deviceState.stageChange(deviceId, setting.key, newValue, original);
				}
			}
		}}
		onclick={() => {
			if (!setting.readonly) {
				const newValue = !displayValue;
				let original = currentValue !== undefined ? currentValue : setting.value?.default_value;

				if (isBool && original === undefined) {
					original = false;
				}

				deviceState.stageChange(deviceId, setting.key, newValue, original);
			}
		}}
	>
		<button
			class="absolute top-4 right-4 z-10 p-1 text-slate-500 transition-colors hover:text-yellow-400"
			class:text-yellow-400={isFavorite}
			onclick={toggleFavorite}
			title={isFavorite ? 'Remove from favorites' : 'Add to favorites'}
		>
			<Star size={16} fill={isFavorite ? 'currentColor' : 'none'} />
		</button>

		<span class="mb-4 w-full">
			<span class="flex items-start justify-between pr-8">
				<h3 class="font-medium break-all text-white">
					{title}
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
			{#if setting.value?.default_value !== undefined && setting.value?.default_value !== null && !isLoading}
				<p class="mt-2 text-xs text-slate-500">
					Default: {options
						? options.find((o) => String(o.value) === String(setting.value?.default_value))
								?.label || setting.value.default_value
						: setting.value.default_value}
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
	</div>
{:else}
	<div
		class="relative flex flex-col justify-between rounded-xl border bg-[#101a29] p-4 transition-colors hover:border-primary/50 sm:p-6"
		class:border-primary={hasStaged}
		class:border-[#334155]={!hasStaged}
		id={setting.key}
	>
		<button
			class="absolute top-4 right-4 z-10 p-1 text-slate-500 transition-colors hover:text-yellow-400"
			class:text-yellow-400={isFavorite}
			onclick={toggleFavorite}
			title={isFavorite ? 'Remove from favorites' : 'Add to favorites'}
		>
			<Star size={16} fill={isFavorite ? 'currentColor' : 'none'} />
		</button>

		<div class="mb-4 pr-8">
			<div class="flex items-start justify-between">
				<h3 class="font-medium break-all text-white">
					{title}
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
			{#if setting.value?.default_value !== undefined && setting.value?.default_value !== null && !isLoading}
				<p class="mt-2 text-xs text-slate-500">
					Default: {options
						? options.find((o) => String(o.value) === String(setting.value?.default_value))
								?.label || setting.value.default_value
						: isJson
							? '(JSON)'
							: String(setting.value.default_value).length > 50
								? String(setting.value.default_value).slice(0, 50) + '...'
								: setting.value.default_value}
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

						const original =
							currentValue !== undefined ? currentValue : setting.value?.default_value;
						deviceState.stageChange(deviceId, setting.key, newValue, original);
					}}
				>
					{#each options as option}
						<option value={option.value}>{option.label}</option>
					{/each}
				</select>
			{:else if isJson}
				<!-- JSON Modal triggering -->
				<button
					class="btn w-full text-slate-300 btn-outline btn-sm hover:border-primary hover:text-primary"
					onclick={() => {
						const event = new CustomEvent('openJsonModal', {
							detail: { title: setting.label, content: displayValue },
							bubbles: true
						});
						document.getElementById(setting.key)?.dispatchEvent(event);
					}}
				>
					View JSON
				</button>
			{:else if !setting.readonly && (isString || isNumber)}
				{#if isNumber && min !== undefined && max !== undefined}
					<div class="flex w-full flex-col gap-2">
						<div class="flex items-center justify-between">
							<span class="text-xs font-medium text-slate-400">{min}</span>
							<span class="text-lg font-bold text-primary">
								{displayValue !== undefined ? displayValue : setting.value?.default_value || min}
							</span>
							<span class="text-xs font-medium text-slate-400">{max}</span>
						</div>
						<div class="flex items-center gap-4">
							<button
								class="btn btn-circle text-slate-400 btn-ghost btn-sm hover:text-white"
								aria-label="Decrease value"
								onclick={() => {
									let current =
										displayValue !== undefined
											? Number(displayValue)
											: Number(setting.value?.default_value || min);
									let newValue = Math.max(min, current - (step || 1));
									const original =
										currentValue !== undefined ? currentValue : setting.value?.default_value;
									deviceState.stageChange(deviceId, setting.key, newValue, original);
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
								value={displayValue !== undefined
									? displayValue
									: setting.value?.default_value || min}
								class="range flex-1 range-primary range-xs"
								oninput={(e: Event & { currentTarget: HTMLInputElement }) => {
									const val = e.currentTarget.value;
									let newValue: string | number = val;
									if (setting.value?.type === 'Int') newValue = parseInt(val, 10);
									if (setting.value?.type === 'Float') newValue = parseFloat(val);

									const original =
										currentValue !== undefined ? currentValue : setting.value?.default_value;
									deviceState.stageChange(deviceId, setting.key, newValue, original);
								}}
							/>
							<button
								class="btn btn-circle text-slate-400 btn-ghost btn-sm hover:text-white"
								aria-label="Increase value"
								onclick={() => {
									let current =
										displayValue !== undefined
											? Number(displayValue)
											: Number(setting.value?.default_value || min);
									let newValue = Math.min(max, current + (step || 1));
									const original =
										currentValue !== undefined ? currentValue : setting.value?.default_value;
									deviceState.stageChange(deviceId, setting.key, newValue, original);
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
						placeholder={setting.value?.default_value ? String(setting.value.default_value) : ''}
						{min}
						{max}
						{step}
						oninput={(e: Event & { currentTarget: HTMLInputElement }) => {
							const val = e.currentTarget.value;
							let newValue: string | number = val;
							if (setting.value?.type === 'Int') newValue = parseInt(val, 10);
							if (setting.value?.type === 'Float') newValue = parseFloat(val);

							const original =
								currentValue !== undefined ? currentValue : setting.value?.default_value;
							deviceState.stageChange(deviceId, setting.key, newValue, original);
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
