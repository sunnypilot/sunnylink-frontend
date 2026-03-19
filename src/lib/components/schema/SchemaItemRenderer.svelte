<script lang="ts">
	import { deviceState } from '$lib/stores/device.svelte';
	import { schemaState } from '$lib/stores/schema.svelte';
	import { isVisible, isEnabled, requiresOffroad, collectParamDependencies, type RuleContext } from '$lib/rules/evaluator';
	import { pushStateStore } from '$lib/stores/pushState.svelte';
	import { setDeviceParams, DeviceRejectionError } from '$lib/api/device';
	import { toastState } from '$lib/stores/toast.svelte';
	import { updateCachedValue } from '$lib/stores/valuesCache';
	import { pendingChanges } from '$lib/stores/pendingChanges.svelte';
	import { driftStore } from '$lib/stores/driftStore.svelte';
	import { encodeParamValue } from '$lib/utils/device';
	import { logtoClient } from '$lib/logto/auth.svelte';
	import type { SchemaItem } from '$lib/types/schema';

	interface Props {
		deviceId: string;
		item: SchemaItem;
		loadingValues?: boolean;
		isLast?: boolean;
		readonly?: boolean;
	}

	let { deviceId, item, loadingValues = false, isLast = false, readonly = false }: Props = $props();

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
	let enabledByRules = $derived(isEnabled(item.enablement, ruleContext));
	let needsOffroad = $derived(requiresOffroad(item.enablement));
	let isPushing = $derived(pushState === 'pushing');

	// Collect param keys this item's enablement depends on
	let enablementDeps = $derived(collectParamDependencies(item.enablement));
	// Disabled if a dependency is currently being pushed by another item
	let blockedByPush = $derived(pushStateStore.isAnyPushing(deviceId, enablementDeps));
	let enabled = $derived(enabledByRules && !blockedByPush && !readonly);

	let currentValue = $derived(deviceState.deviceValues[deviceId]?.[item.key]);
	let displayValue: unknown = $derived(
		currentValue !== undefined ? currentValue : undefined
	);

	let isLoading = $derived(loadingValues && currentValue === undefined);
	let isFloat = $derived(item.step !== undefined && item.step < 1);
	let isOn = $derived(displayValue === true || displayValue === 1 || displayValue === '1');

	// Pending change state for this specific item
	let pendingChange = $derived(pendingChanges.getForKey(deviceId, item.key));
	let isQueued = $derived(pendingChange?.status === 'pending');
	let isDeviceOnline = $derived(deviceState.onlineStatuses[deviceId] === 'online');

	// Drift state for this specific item
	let driftEntry = $derived(driftStore.getForKey(deviceId, item.key));
	let hasDrift = $derived(!!driftEntry);

	// ── Immediate push ──────────────────────────────────────────────────────

	function inferParamType(): string {
		const deviceParams = deviceState.deviceSettings[deviceId];
		if (deviceParams) {
			const paramInfo = deviceParams.find((p) => p.key === item.key);
			if (paramInfo?.type) return paramInfo.type;
		}
		if (item.widget === 'toggle') return 'Bool';
		if (item.widget === 'option' && isFloat) return 'Float';
		if (item.widget === 'option') return 'Int';
		if (item.widget === 'multiple_button') return 'Int';
		return 'String';
	}

	async function pushValue(newValue: unknown) {
		if (!logtoClient) return;

		if (!deviceState.deviceValues[deviceId]) {
			deviceState.deviceValues[deviceId] = {};
		}
		const previousValue = deviceState.deviceValues[deviceId][item.key];

		// Offline: queue the change instead of pushing immediately
		if (!isDeviceOnline) {
			deviceState.deviceValues[deviceId][item.key] = newValue;
			pendingChanges.enqueue(deviceId, item.key, newValue, previousValue);
			toastState.show('Change queued. Will sync when device reconnects.', 'info');
			return;
		}

		// Online: immediate optimistic push
		deviceState.deviceValues[deviceId][item.key] = newValue;
		pendingChanges.enqueue(deviceId, item.key, newValue, previousValue);
		pendingChanges.markPushing(deviceId, item.key);

		pushState = 'pushing';
		pushError = '';
		pushStateStore.startPush(deviceId, item.key);

		try {
			const token = await logtoClient.getIdToken();
			if (!token) throw new Error('Session expired');

			const paramType = inferParamType();
			const encoded = encodeParamValue({ key: item.key, value: newValue, type: paramType });
			if (encoded === null) throw new Error('Failed to encode value');

			// Rule 2: 5s timeout per edge case rules
			await setDeviceParams(deviceId, [{ key: item.key, value: encoded }], token, 5000);

			pushStateStore.endPush(deviceId, item.key);
			pendingChanges.markConfirmed(deviceId, item.key);
			pushState = 'success';

			// Update localStorage cache with new value
			const gitCommit = (deviceState.deviceValues[deviceId]?.['GitCommit'] as string) || '';
			if (gitCommit) updateCachedValue(deviceId, gitCommit, item.key, newValue);

			setTimeout(() => {
				if (pushState === 'success') pushState = 'idle';
			}, 3000); // extended from 1.5s for clarity
		} catch (e) {
			// Rollback optimistic update
			deviceState.deviceValues[deviceId][item.key] = previousValue;
			pushStateStore.endPush(deviceId, item.key);
			pendingChanges.markFailed(deviceId, item.key, (e as Error)?.message || 'Failed');
			pushState = 'error';

			// Rule 3: Contextual error handling
			if (e instanceof DeviceRejectionError) {
				pushError = e.message;
				toastState.show(`Setting rejected: ${e.message}`, 'error');
			} else if ((e as Error)?.name === 'AbortError' || (e as Error)?.message === 'Timeout') {
				pushError = 'Device did not respond';
				toastState.show('Timeout: Could not reach device. Please check connection.', 'warning', {
					label: 'Retry',
					onclick: () => pushValue(newValue)
				});
			} else if ((e as Error)?.message === 'Session expired') {
				pushError = 'Session expired';
				toastState.show('Session expired. Please sign in again.', 'error');
			} else {
				pushError = (e as Error)?.message || 'Failed to save';
				toastState.show(`Failed to save: ${pushError}`, 'error');
			}

			// Don't auto-dismiss rejection errors — user should see them
			if (!(e instanceof DeviceRejectionError)) {
				setTimeout(() => {
					if (pushState === 'error') pushState = 'idle';
				}, 5000);
			}
		}
	}

	function handleChange(newValue: unknown) {
		pushValue(newValue);
	}

	// Row-level left accent for push/queue/drift feedback
	let accentClass = $derived(
		pushState === 'success'
			? 'border-l-2 border-l-emerald-500'
			: pushState === 'error'
				? 'border-l-2 border-l-red-500'
				: isQueued
					? 'border-l-2 border-l-amber-500'
					: hasDrift
						? 'border-l-2 border-l-cyan-500'
						: 'border-l-2 border-l-transparent'
	);

	// Divider: show unless this is the last item
	let showDivider = $derived(!isLast);

	function formatDisplay(val: unknown): string {
		if (val === undefined || val === null) return '-';
		if (isFloat && typeof val === 'number') return val.toFixed(2);
		return String(val);
	}

	// ── Responsive segmented → compact → dropdown ─────────────────────────
	// Two-tier overflow check using Canvas text measurement for accuracy:
	//   Normal (14px, px-2.5=20px pad): if labels fit → standard segments
	//   Compact (13px, px-1.5=12px pad, tracking-tight): if labels fit → compact segments
	//   Otherwise → dropdown
	// Container: card px-4 (32px) + segment wrapper p-1 (8px) = 40px overhead.
	const MOBILE_CONTAINER_PX = 390 - 40;
	const DESKTOP_CONTAINER_PX = 672 - 40;
	const NORMAL_PAD_PX = 20;
	const COMPACT_PAD_PX = 12;

	let isMobile = $state(false);
	let measureCtx: CanvasRenderingContext2D | null = null;

	if (typeof window !== 'undefined') {
		const mql = window.matchMedia('(max-width: 767px)');
		isMobile = mql.matches;
		$effect(() => {
			const handler = (e: MediaQueryListEvent) => { isMobile = e.matches; };
			mql.addEventListener('change', handler);
			return () => mql.removeEventListener('change', handler);
		});
		const canvas = document.createElement('canvas');
		measureCtx = canvas.getContext('2d');
	}

	function measureLabel(label: string, fontSpec: string): number {
		if (!measureCtx) return label.length * 8; // SSR fallback
		measureCtx.font = fontSpec;
		return measureCtx.measureText(label).width;
	}

	function wouldTruncate(options: { label: string }[], containerPx: number, fontSpec: string, padPx: number): boolean {
		const segmentWidth = containerPx / options.length;
		// 6px buffer for sub-pixel rounding, letter-spacing, and font rendering differences
		return options.some((opt) => measureLabel(opt.label, fontSpec) + padPx + 6 > segmentWidth);
	}

	type SegmentMode = 'normal' | 'compact' | 'dropdown';

	let segmentMode: SegmentMode = $derived.by(() => {
		if (item.widget !== 'multiple_button' || !item.options || item.options.length === 0) return 'normal';
		const containerPx = isMobile ? MOBILE_CONTAINER_PX : DESKTOP_CONTAINER_PX;
		if (!wouldTruncate(item.options, containerPx, '500 14px system-ui, -apple-system, sans-serif', NORMAL_PAD_PX)) return 'normal';
		if (!wouldTruncate(item.options, containerPx, '500 13px system-ui, -apple-system, sans-serif', COMPACT_PAD_PX)) return 'compact';
		return 'dropdown';
	});

	let useDropdownForSegments = $derived(segmentMode === 'dropdown');
	let useCompactSegments = $derived(segmentMode === 'compact');

	/** Sanitize description: allow only <br> tags, escape everything else */
	function sanitizeDescription(text: string): string {
		return text
			.replace(/&/g, '&amp;')
			.replace(/</g, '&lt;')
			.replace(/>/g, '&gt;')
			.replace(/&lt;br&gt;/gi, '<br>')
			.replace(/&lt;br\s*\/&gt;/gi, '<br>');
	}
</script>

{#if visible}
	<div
		class="transition-all duration-150 {accentClass}"
		class:opacity-40={!enabled}
		class:opacity-60={enabled && isPushing}
		id={item.key}
	>
		{#if item.widget === 'toggle'}
			<!-- ── Toggle Row ──────────────────────────────────────────────── -->
			<button
				class="group flex w-full items-center justify-between px-4 py-4 text-left hover:bg-[var(--sl-bg-subtle)]"
				style="transition: background-color var(--dur-fast) var(--ease-out);"
				class:cursor-not-allowed={!enabled}
				disabled={!enabled || isPushing}
				aria-pressed={isOn}
				tabindex={!enabled ? -1 : 0}
				onclick={() => {
					if (enabled && !isPushing) handleChange(!isOn);
				}}
			>
				<div class="mr-4 min-w-0 flex-1">
					<div class="flex items-center gap-2">
						<span class="text-sm font-medium text-[var(--sl-text-1)]">{item.title || item.key}</span>
						{#if isQueued}
							<span class="rounded-full bg-amber-500/15 px-1.5 py-0.5 text-[0.625rem] font-semibold text-amber-400">Queued</span>
						{:else if isPushing}
							<span class="loading loading-spinner loading-xs text-primary"></span>
						{:else if pushState === 'success'}
							<svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none"
								stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"
								class="text-emerald-500 transition-opacity"><path d="M20 6 9 17l-5-5" /></svg>
						{:else if hasDrift}
							<span class="rounded-full bg-cyan-500/15 px-1.5 py-0.5 text-[0.625rem] font-semibold text-cyan-400">Changed on device</span>
						{/if}
						{#if needsOffroad && !ruleContext.isOffroad}
							<span class="rounded-md bg-amber-500/15 px-1.5 py-0.5 text-[0.6rem] font-semibold tracking-wider text-amber-500 uppercase">
								Offroad
							</span>
						{/if}
					</div>
					{#if item.description}
						<p class="mt-0.5 text-sm leading-snug text-[var(--sl-text-2)]">{@html sanitizeDescription(item.description)}</p>
					{/if}
					{#if pushState === 'error'}
						<p class="mt-0.5 text-xs text-red-500">{pushError}</p>
					{/if}
				</div>
				<div class="flex shrink-0 items-center">
					{#if isLoading}
						<div class="h-[31px] w-[51px] skeleton-shimmer rounded-full"></div>
					{:else}
						{@const toggleTrackClass =
							isOn && isPushing ? 'bg-primary/40'
							: isOn ? 'bg-primary'
							: !enabled ? 'bg-[var(--sl-toggle-off-disabled)]'
							: 'bg-[var(--sl-toggle-off)]'
						}
						<div
							class="relative inline-flex h-[31px] w-[51px] shrink-0 items-center rounded-full {toggleTrackClass}"
							style="transition: background-color var(--dur-instant) var(--ease-out);"
						>
							<span
								class="absolute top-[2px] left-[2px] h-[27px] w-[27px] rounded-full bg-white shadow-sm"
								class:translate-x-[20px]={isOn}
								style="transition: transform var(--dur-instant) var(--ease-spring);"
							></span>
						</div>
					{/if}
				</div>
			</button>

		{:else if item.widget === 'option'}
			<!-- ── Option Row (select / slider) ────────────────────────────── -->
			<div class="px-4 py-4">
				<div class="flex items-center gap-2">
					<span class="text-sm font-medium text-[var(--sl-text-1)]">{item.title || item.key}</span>
					{#if isPushing}
						<span class="loading loading-spinner loading-xs text-primary"></span>
					{:else if pushState === 'success'}
						<svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none"
							stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"
							class="text-emerald-500"><path d="M20 6 9 17l-5-5" /></svg>
					{:else if hasDrift}
						<span class="rounded-full bg-cyan-500/15 px-1.5 py-0.5 text-[0.625rem] font-semibold text-cyan-400">Changed on device</span>
					{/if}
					{#if needsOffroad && !ruleContext.isOffroad}
						<span class="rounded-md bg-amber-500/15 px-1.5 py-0.5 text-[0.6rem] font-semibold tracking-wider text-amber-500 uppercase">
							Offroad
						</span>
					{/if}
				</div>
				{#if item.description}
					<p class="mt-0.5 text-sm leading-snug text-[var(--sl-text-2)]">{@html sanitizeDescription(item.description)}</p>
				{/if}
				{#if pushState === 'error'}
					<p class="mt-0.5 text-xs text-red-500">{pushError}</p>
				{/if}

				<div class="mt-2.5">
					{#if isLoading}
						<div class="h-8 w-full skeleton-shimmer rounded-lg"></div>
					{:else if item.options}
						<select
							class="w-full rounded-lg border border-[var(--sl-border)] bg-[var(--sl-bg-input)] px-3 py-2.5 text-sm text-[var(--sl-text-1)] transition-colors focus:border-primary focus:outline-none"
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
							<div class="flex items-center justify-between text-xs text-[var(--sl-text-3)]">
								<span>{isFloat ? Number(item.min).toFixed(2) : item.min}</span>
								<span class="text-sm font-semibold text-primary tabular-nums">
									{formatDisplay(displayValue !== undefined ? displayValue : item.min)}
									{#if item.unit}<span class="ml-0.5 text-xs font-normal text-[var(--sl-text-3)]">{item.unit}</span>{/if}
								</span>
								<span>{isFloat ? Number(item.max).toFixed(2) : item.max}</span>
							</div>
							<div class="flex items-center gap-2">
								<button
									class="flex h-10 w-10 items-center justify-center rounded-lg text-[var(--sl-text-3)] transition-colors hover:bg-[var(--sl-bg-elevated)] hover:text-[var(--sl-text-1)]"
									disabled={!enabled || isPushing}
									onclick={() => {
										const current = displayValue !== undefined ? Number(displayValue) : Number(item.min);
										const nv = Math.max(item.min!, current - (item.step || 1));
										handleChange(isFloat ? parseFloat(nv.toFixed(2)) : nv);
									}}
								>
									<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none"
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
									class="flex h-10 w-10 items-center justify-center rounded-lg text-[var(--sl-text-3)] transition-colors hover:bg-[var(--sl-bg-elevated)] hover:text-[var(--sl-text-1)]"
									disabled={!enabled || isPushing}
									onclick={() => {
										const current = displayValue !== undefined ? Number(displayValue) : Number(item.min);
										const nv = Math.min(item.max!, current + (item.step || 1));
										handleChange(isFloat ? parseFloat(nv.toFixed(2)) : nv);
									}}
								>
									<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none"
										stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14" /><path d="M12 5v14" /></svg>
								</button>
							</div>
						</div>
					{:else}
						<div class="rounded-lg bg-[var(--sl-bg-input)] px-3 py-1.5 text-center text-sm font-medium text-[var(--sl-text-1)]">
							{formatDisplay(displayValue)}
						</div>
					{/if}
				</div>
			</div>

		{:else if item.widget === 'multiple_button'}
			<!-- ── Segmented Button Row ────────────────────────────────────── -->
			<div class="px-4 py-4">
				<div class="flex items-center gap-2">
					<span class="text-sm font-medium text-[var(--sl-text-1)]">{item.title || item.key}</span>
					{#if isPushing}
						<span class="loading loading-spinner loading-xs text-primary"></span>
					{:else if pushState === 'success'}
						<svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none"
							stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"
							class="text-emerald-500"><path d="M20 6 9 17l-5-5" /></svg>
					{:else if hasDrift}
						<span class="rounded-full bg-cyan-500/15 px-1.5 py-0.5 text-[0.625rem] font-semibold text-cyan-400">Changed on device</span>
					{/if}
					{#if needsOffroad && !ruleContext.isOffroad}
						<span class="rounded-md bg-amber-500/15 px-1.5 py-0.5 text-[0.6rem] font-semibold tracking-wider text-amber-500 uppercase">
							Offroad
						</span>
					{/if}
				</div>
				{#if item.description}
					<p class="mt-0.5 text-sm leading-snug text-[var(--sl-text-2)]">{@html sanitizeDescription(item.description)}</p>
				{/if}
				{#if pushState === 'error'}
					<p class="mt-0.5 text-xs text-red-500">{pushError}</p>
				{/if}

				<div class="mt-2.5">
					{#if isLoading}
						<div class="h-8 w-full skeleton-shimmer rounded-lg"></div>
					{:else if item.options && useDropdownForSegments}
						<!-- Dropdown fallback for many options on narrow screens -->
						<select
							class="w-full rounded-lg border border-[var(--sl-border)] bg-[var(--sl-bg-input)] px-3 py-2.5 text-sm text-[var(--sl-text-1)] transition-colors focus:border-primary focus:outline-none"
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
					{:else if item.options}
						{@const selectedIdx = item.options.findIndex((o) => String(displayValue) === String(o.value))}
						{@const optCount = item.options.length}
						<div class="relative flex rounded-lg bg-[var(--sl-bg-input)] p-1">
							<!-- Sliding highlight pill -->
							{#if selectedIdx >= 0}
								<div
									class="absolute top-1 bottom-1 rounded-md bg-primary shadow-sm transition-transform duration-350 ease-out"
									style="width: calc((100% - 0.5rem) / {optCount}); transform: translateX(calc({selectedIdx} * 100%));"
								></div>
							{/if}
							{#each item.options as option, oi}
								{@const isSelected = oi === selectedIdx}
								<button
									class="relative z-10 min-w-0 flex-1 truncate rounded-md py-2.5 font-medium transition-colors duration-350 {useCompactSegments ? 'px-1.5 text-[0.8125rem] tracking-tight' : 'px-2.5 text-sm'}"
									class:text-white={isSelected}
									class:text-[var(--sl-text-2)]={!isSelected}
									class:hover:text-[var(--sl-text-1)]={!isSelected}
									disabled={!enabled || isPushing}
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
			<!-- ── Info Row ────────────────────────────────────────────────── -->
			<div class="px-4 py-4">
				<span class="text-sm font-medium text-[var(--sl-text-1)]">{item.title || item.key}</span>
				{#if item.description}
					<p class="mt-0.5 text-sm leading-snug text-[var(--sl-text-2)]">{@html sanitizeDescription(item.description)}</p>
				{/if}
				<div class="mt-2 rounded-lg bg-[var(--sl-bg-input)] px-3 py-1.5 text-center text-sm font-medium tabular-nums text-[var(--sl-text-1)]">
					{formatDisplay(displayValue)}
				</div>
			</div>
		{/if}

		<!-- Hairline divider between rows -->
		{#if showDivider}
			<div class="mx-4 border-b border-[var(--sl-border-muted)]"></div>
		{/if}
	</div>

	<!-- Recursive sub_items -->
	{#if item.sub_items}
		{#each item.sub_items as subItem, i (subItem.key)}
			<svelte:self deviceId={deviceId} item={subItem} {loadingValues} {readonly} isLast={i === item.sub_items.length - 1 && isLast} />
		{/each}
	{/if}
{/if}
