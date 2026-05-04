<script lang="ts">
	import { deviceState } from '$lib/stores/device.svelte';
	import { schemaState } from '$lib/stores/schema.svelte';
	import {
		isVisible,
		isEnabled,
		evaluateRules,
		requiresOffroad,
		isAdvancedSetting,
		getDisabledReasons,
		collectParamDependencies,
		type RuleContext
	} from '$lib/rules/evaluator';
	import { pushStateStore } from '$lib/stores/pushState.svelte';
	import { batchPush } from '$lib/stores/batchPush.svelte';
	import { pendingChanges } from '$lib/stores/pendingChanges.svelte';
	import { refreshBanner } from '$lib/stores/refreshBanner.svelte';
	import type { SchemaItem, SchemaOption } from '$lib/types/schema';
	import ForceOffroadModal from '$lib/components/ForceOffroadModal.svelte';
	import InfoDetailsModal from '$lib/components/InfoDetailsModal.svelte';
	import { Info, Loader2 } from 'lucide-svelte';
	import SelectDropdown from '$lib/components/SelectDropdown.svelte';
	import Tooltip from '$lib/components/Tooltip.svelte';
	import { toast } from 'svelte-sonner';

	interface Props {
		deviceId: string;
		item: SchemaItem;
		loadingValues?: boolean;
		isLast?: boolean;
		readonly?: boolean;
	}

	let { deviceId, item, loadingValues = false, isLast = false, readonly = false }: Props = $props();

	// Unified push state — merges online (batchPush) and offline (pendingChanges) stores.
	// Online debounce ('pending') is invisible — no badge, toggle stays interactive.
	// Only 'syncing'/'pushing' disables the toggle.
	let batchKeyState = $derived(batchPush.getKeyState(deviceId, item.key));
	let pushState = $derived.by((): 'idle' | 'pending' | 'pushing' | 'success' | 'error' => {
		// Online batch push takes priority
		if (batchKeyState === 'syncing') return 'pushing';
		if (batchKeyState === 'confirmed') return 'success';
		if (batchKeyState === 'failed') return 'error';
		if (batchKeyState === 'pending') return 'pending';
		// Offline pending changes fallback (for flush checkmarks/spinners)
		const pcStatus = pendingChanges.getForKey(deviceId, item.key)?.status;
		if (pcStatus === 'pushing') return 'pushing';
		if (pcStatus === 'confirmed') return 'success';
		if (pcStatus === 'failed') return 'error';
		return 'idle';
	});

	let ruleContext: RuleContext = $derived({
		capabilities: schemaState.capabilities[deviceId] ?? null,
		paramValues: deviceState.deviceValues[deviceId] ?? {},
		isOffroad: deviceState.offroadStatuses[deviceId]?.isOffroad ?? true,
		engaged: deviceState.deviceTelemetry[deviceId]?.engaged ?? false
	});

	let visible = $derived(isVisible(item.visibility, ruleContext));
	let isDeviceOnly = $derived(!!item.blocked);
	let enabledByRules = $derived(isDeviceOnly ? false : isEnabled(item.enablement, ruleContext));
	let needsOffroad = $derived(requiresOffroad(item.enablement));
	let isAdvanced = $derived(
		isAdvancedSetting(item.enablement) || isAdvancedSetting(item.visibility)
	);
	let isAdvancedGated = $derived(isAdvanced && !ruleContext.paramValues.ShowAdvancedControls);
	let advancedTooltip = $derived(
		isAdvancedGated
			? 'Advanced setting. Enable "Show Advanced Controls" in Developer to access.'
			: 'This is an advanced setting.'
	);
	let isPushing = $derived(pushState === 'pushing');

	// Human-readable reasons why this item is disabled (for WCAG badges)
	function paramTitleLookup(key: string): string | undefined {
		const schema = schemaState.schemas[deviceId];
		if (!schema) return undefined;
		for (const panel of schema.panels ?? []) {
			for (const it of panel.items ?? []) {
				if (it.key === key) return it.title;
			}
			for (const sp of panel.sub_panels ?? []) {
				for (const it of sp.items) {
					if (it.key === key) return it.title;
				}
			}
			for (const sec of panel.sections ?? []) {
				for (const it of sec.items) {
					if (it.key === key) return it.title;
				}
				for (const sp of sec.sub_panels ?? []) {
					for (const it of sp.items) {
						if (it.key === key) return it.title;
					}
				}
			}
		}
		return undefined;
	}

	let capabilityLabels = $derived(schemaState.schemas[deviceId]?.capability_labels);

	let disabledReasons = $derived.by(() => {
		if (isDeviceOnly) return ['This setting can only be changed on the device.'];
		const reasons: string[] = [];
		if (!visible) {
			const visReasons = getDisabledReasons(
				item.visibility,
				ruleContext,
				paramTitleLookup,
				capabilityLabels
			);
			if (visReasons.length > 0) {
				reasons.push(...visReasons);
			} else if (isAdvanced) {
				reasons.push('Enable "Show Advanced Controls" to use this setting.');
			}
		}
		if (!enabledByRules) {
			reasons.push(
				...getDisabledReasons(item.enablement, ruleContext, paramTitleLookup, capabilityLabels)
			);
		}
		// Deduplicate — visibility and enablement rules can produce overlapping reasons
		return [...new Set(reasons)];
	});

	// Collect param keys this item's enablement depends on
	let enablementDeps = $derived(collectParamDependencies(item.enablement));
	// Disabled if a dependency is currently being pushed by another item
	let blockedByPush = $derived(pushStateStore.isAnyPushing(deviceId, enablementDeps));
	let enabled = $derived(visible && enabledByRules && !blockedByPush && !readonly);

	// Dynamic title suffix based on a param value
	let displayTitle = $derived.by(() => {
		const base = item.title || item.key;
		const suffix = item.title_param_suffix;
		if (!suffix) return base;
		const paramVal = deviceState.deviceValues[deviceId]?.[suffix.param];
		const boolKey = paramVal ? 'true' : 'false';
		const suffixText = suffix.values[String(paramVal)] ?? suffix.values[boolKey] ?? '';
		return suffixText ? `${base} ${suffixText}` : base;
	});

	let currentValue = $derived(deviceState.deviceValues[deviceId]?.[item.key]);
	let displayValue: unknown = $derived(currentValue);

	function isOptionEnabled(option: SchemaOption): boolean {
		if (!option.enablement || option.enablement.length === 0) return true;
		return evaluateRules(option.enablement, ruleContext);
	}

	let disabledOptionValues = $derived.by(() => {
		if (!item.options) return undefined;
		const disabled = new Set<string | number>();
		for (const opt of item.options) {
			if (!isOptionEnabled(opt)) disabled.add(opt.value);
		}
		return disabled.size > 0 ? disabled : undefined;
	});

	// Auto-snap: when the current value is a disabled option, push the nearest enabled one.
	// Mirrors device-side behavior (e.g. MadsSteeringMode → DISENGAGE, SpeedLimitMode → Warning).
	$effect(() => {
		if (!item.options || !disabledOptionValues || currentValue === undefined) return;
		if (!disabledOptionValues.has(currentValue as string | number)) return;
		// Current value is disabled — find the last enabled option (closest to device-side snap behavior)
		const enabledOptions = item.options.filter((o) => !disabledOptionValues.has(o.value));
		if (enabledOptions.length === 0) return;
		const snapTo = enabledOptions[enabledOptions.length - 1]!;
		pushValue(snapTo.value);
	});

	let isLoading = $derived(loadingValues && currentValue === undefined);
	let isFloat = $derived(item.step !== undefined && item.step < 1);
	let isOn = $derived(displayValue === true || displayValue === 1 || displayValue === '1');

	let resolvedUnit = $derived.by(() => {
		if (!item.unit) return undefined;
		if (typeof item.unit === 'string') return item.unit;
		const isMetric = ruleContext.paramValues?.['IsMetric'];
		return isMetric === true || isMetric === 1 || isMetric === '1'
			? item.unit.metric
			: item.unit.imperial;
	});

	// Live slider preview: shows value during drag, resets on release
	let sliderPreview = $state<number | null>(null);

	// Force Offroad: special handling for OffroadMode key
	let isOffroadMode = $derived(item.key === 'OffroadMode');
	let offroadConfirmOpen = $state(false);
	let detailsOpen = $state(false);

	// Pending change state for this specific item
	let pendingChange = $derived(pendingChanges.getForKey(deviceId, item.key));
	let isQueued = $derived(pendingChange?.status === 'pending');
	let isBlocked = $derived(pendingChange?.status === 'blocked_onroad');
	let isDeviceOnline = $derived(deviceState.onlineStatuses[deviceId] === 'online');

	function handleRevert() {
		const values = deviceState.deviceValues[deviceId];
		// Online path: cancel the debounced batch push and restore the
		// original value. Offline path: drop the queued pendingChange.
		// Online and offline can't hold the same key at once, but calling
		// both is safe — each no-ops if the key isn't in its queue.
		batchPush.revert(deviceId, item.key, values);
		pendingChanges.revert(deviceId, item.key, values);
	}

	// Badge state: this key was flagged as "changed on device" by the settings
	// layout's passive-drift prefetch. Cleared when the user acknowledges the
	// refresh banner (jump or bulk dismiss). Source unified with banner so both
	// surfaces clear together.
	let hasDrift = $derived(refreshBanner.getAll(deviceId).some((e) => e.key === item.key));

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

	function pushValue(newValue: unknown) {
		if (!deviceState.deviceValues[deviceId]) {
			deviceState.deviceValues[deviceId] = {};
		}
		const previousValue = deviceState.deviceValues[deviceId][item.key];

		// Offline: queue the change for later sync
		if (!isDeviceOnline) {
			const hadPending = !!pendingChanges.getForKey(deviceId, item.key);
			deviceState.deviceValues[deviceId][item.key] = newValue;
			pendingChanges.enqueue(deviceId, item.key, newValue, previousValue);
			const stillPending = !!pendingChanges.getForKey(deviceId, item.key);

			if (!stillPending && hadPending) {
				toast.info('Reverted to original. Pending changes removed.');
			} else if (stillPending) {
				toast.info('Changes pending. Will sync when device reconnects.');
			}
			return;
		}

		// Online: optimistic update + enqueue to batch (4s debounce)
		// Clear any stale offline pending entry — this key is now handled by batchPush
		pendingChanges.remove(deviceId, item.key);
		deviceState.deviceValues[deviceId][item.key] = newValue;
		batchPush.enqueue(deviceId, item.key, newValue, previousValue, inferParamType());
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
				: pushState === 'pushing'
					? 'border-l-2 border-l-blue-500'
					: pushState === 'pending' || isQueued
						? 'border-l-2 border-l-amber-500'
						: hasDrift
							? 'border-l-2 border-l-cyan-500'
							: 'border-l-2 border-l-transparent'
	);

	// Divider: show unless this is the last item with no sub_items below it
	let hasSubItems = $derived(!!(item.sub_items && item.sub_items.length > 0));
	let showDivider = $derived(!isLast || hasSubItems);

	function formatDisplay(val: unknown): string {
		if (val === undefined || val === null) return '-';
		if (isFloat && typeof val === 'number') return val.toFixed(2);
		return String(val);
	}

	// Two-tier overflow check using Canvas text measurement for accuracy:
	//   Normal (14px, px-2.5=20px pad): if labels fit → standard segments
	//   Compact (13px, px-1.5=12px pad, tracking-tight): if labels fit → compact segments
	//   Otherwise → dropdown
	// Container: card px-4 (32px) + segment wrapper p-1 (8px) = 40px overhead.
	// Right-aligned segmented control budget (Apple HIG iOS Settings pattern).
	// Title takes the left ~40-50%, segmented control sits in remaining right space.
	// When labels don't fit this budget, segmentMode falls through to 'dropdown'.
	const MOBILE_CONTAINER_PX = 200;
	const DESKTOP_CONTAINER_PX = 280;
	const NORMAL_PAD_PX = 20;
	const COMPACT_PAD_PX = 12;

	let isMobile = $state(false);
	let measureCtx: CanvasRenderingContext2D | null = null;

	if (typeof window !== 'undefined') {
		const mql = window.matchMedia('(max-width: 767px)');
		isMobile = mql.matches;
		$effect(() => {
			const handler = (e: MediaQueryListEvent) => {
				isMobile = e.matches;
			};
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

	function wouldTruncate(
		options: { label: string }[],
		containerPx: number,
		fontSpec: string,
		padPx: number
	): boolean {
		const segmentWidth = containerPx / options.length;
		// 6px buffer for sub-pixel rounding, letter-spacing, and font rendering differences
		return options.some((opt) => measureLabel(opt.label, fontSpec) + padPx + 6 > segmentWidth);
	}

	type SegmentMode = 'normal' | 'compact' | 'dropdown';

	let segmentMode: SegmentMode = $derived.by(() => {
		if (item.widget !== 'multiple_button' || !item.options || item.options.length === 0)
			return 'normal';
		const containerPx = isMobile ? MOBILE_CONTAINER_PX : DESKTOP_CONTAINER_PX;
		if (
			!wouldTruncate(
				item.options,
				containerPx,
				'500 14px system-ui, -apple-system, sans-serif',
				NORMAL_PAD_PX
			)
		)
			return 'normal';
		if (
			!wouldTruncate(
				item.options,
				containerPx,
				'500 13px system-ui, -apple-system, sans-serif',
				COMPACT_PAD_PX
			)
		)
			return 'compact';
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

	/** Slider drag tracking — while pointer is held on the range input,
	 *  pause the batchPush debounce timer so the per-key 4s countdown does
	 *  not expire mid-drag and flush a stale value. Window-level pointerup /
	 *  pointercancel / blur listeners catch every release path including
	 *  pointer leaving the track or focus loss. A 30s safeguard force-
	 *  releases if no release event fires (browser bug / dead pointer). */
	let isDragging = false;
	let dragSafetyTimer: ReturnType<typeof setTimeout> | undefined = undefined;
	const DRAG_SAFETY_MS = 30_000;

	function endSliderDrag() {
		if (!isDragging) return;
		isDragging = false;
		if (dragSafetyTimer !== undefined) {
			clearTimeout(dragSafetyTimer);
			dragSafetyTimer = undefined;
		}
		batchPush.releaseDebounce(deviceId);
		if (typeof window !== 'undefined') {
			window.removeEventListener('pointerup', endSliderDrag);
			window.removeEventListener('pointercancel', endSliderDrag);
			window.removeEventListener('blur', endSliderDrag);
		}
	}

	function startSliderDrag() {
		if (isDragging) return;
		isDragging = true;
		batchPush.holdDebounce(deviceId);
		if (typeof window !== 'undefined') {
			window.addEventListener('pointerup', endSliderDrag);
			window.addEventListener('pointercancel', endSliderDrag);
			window.addEventListener('blur', endSliderDrag);
		}
		dragSafetyTimer = setTimeout(() => {
			batchPush.clearHolds(deviceId);
			endSliderDrag();
		}, DRAG_SAFETY_MS);
	}
</script>

<div
	class="transition-all duration-150 {accentClass}"
	class:setting-dimmed={!visible || !enabled}
	id={item.key}
>
	{#snippet detailsBtn()}
		{#if item.details}
			<button
				type="button"
				class="ml-1 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[var(--sl-text-3)] transition-colors hover:bg-[var(--sl-bg-subtle)] hover:text-[var(--sl-text-1)] focus-visible:outline-2 focus-visible:outline-[var(--sl-text-2)] active:scale-[0.94]"
				aria-label="More details about {displayTitle}"
				onclick={(e) => {
					e.stopPropagation();
					detailsOpen = true;
				}}
			>
				<Info size={14} />
			</button>
		{/if}
	{/snippet}

	{#if isOffroadMode}
		<!-- ── Always Offroad Mode: Button pattern (matches device UI) ── -->
		<div class="flex w-full items-center justify-between px-4 py-4">
			<div class="mr-4 min-w-0 flex-1">
				<span class="text-[0.8125rem] font-medium text-[var(--sl-text-1)]">
					Always Offroad Mode
				</span>
				{#if isOn}
					<p
						class="mt-0.5 text-[0.75rem] leading-snug font-[450] text-amber-700 dark:text-amber-400"
					>
						Vehicle engagement is disabled
					</p>
				{:else if item.description}
					<p class="mt-0.5 text-[0.75rem] leading-snug font-[450] text-[var(--sl-text-3)]">
						{@html sanitizeDescription(item.description)}
					</p>
				{/if}
			</div>
			<div class="flex shrink-0 items-center">
				{#if isLoading}
					<div class="skeleton-shimmer h-8 w-24 rounded-full"></div>
				{:else if isPushing}
					<Loader2 size={16} class="animate-spin text-[var(--sl-text-2)]" />
				{:else if isOn}
					<button
						class="rounded-full bg-amber-500/15 px-4 py-1.5 text-[0.8125rem] font-medium text-amber-700 transition-colors hover:bg-amber-500/25 focus-visible:outline-2 focus-visible:outline-amber-500 active:scale-[0.98] active:bg-amber-500/30 dark:text-amber-400"
						disabled={!enabled}
						onclick={() => handleChange(false)}
					>
						Exit Offroad
					</button>
				{:else}
					<button
						class="rounded-full bg-red-500/15 px-4 py-1.5 text-[0.8125rem] font-medium text-red-600 transition-colors hover:bg-red-500/25 focus-visible:outline-2 focus-visible:outline-red-500 active:scale-[0.98] active:bg-red-500/35 dark:text-red-400"
						disabled={!enabled}
						onclick={() => (offroadConfirmOpen = true)}
					>
						Enable
					</button>
				{/if}
			</div>
		</div>

		<ForceOffroadModal
			bind:open={offroadConfirmOpen}
			onSuccess={async () => {
				// Re-sync device status so offroadStatuses reflects the truth.
				const { logtoClient } = await import('$lib/logto/auth.svelte');
				const { checkDeviceStatus } = await import('$lib/api/device');
				const token = await logtoClient?.getIdToken();
				if (token) await checkDeviceStatus(deviceId, token, true);
			}}
		/>
	{:else if item.widget === 'toggle'}
		<!-- ── Toggle Row ──────────────────────────────────────────────── -->
		<div class="flex w-full items-center justify-between px-4 py-4">
			<div class="mr-4 min-w-0 flex-1">
				<div class="flex flex-wrap items-center gap-x-2 gap-y-1">
					<button
						class="text-left text-[0.8125rem] font-medium text-[var(--sl-text-1)]"
						class:cursor-not-allowed={!enabled}
						disabled={!enabled || isPushing}
						onclick={() => {
							if (enabled && !isPushing) handleChange(!isOn);
						}}>{displayTitle}</button
					>
					{@render detailsBtn()}
					{#if isBlocked}
						<Tooltip
							text="Blocked — this setting requires offroad. Will sync when the car is powered off."
						>
							<span
								class="rounded-full bg-red-500/15 px-1.5 py-0.5 text-[0.625rem] leading-none font-semibold text-red-700 dark:text-red-400"
								>Blocked</span
							>
						</Tooltip>
						<button
							class="rounded-full bg-[var(--sl-bg-subtle)] px-1.5 py-0.5 text-[0.625rem] leading-none font-medium text-[var(--sl-text-2)] transition-all duration-100 hover:bg-[var(--sl-bg-elevated)] hover:text-[var(--sl-text-1)] active:scale-[0.92] active:bg-[var(--sl-bg-elevated)]"
							onclick={handleRevert}>Revert</button
						>
					{:else if isQueued || pushState === 'pending'}
						<Tooltip text="Changes queued — will sync to device when pushed.">
							<span
								class="rounded-full bg-amber-500/15 px-1.5 py-0.5 text-[0.625rem] leading-none font-semibold tracking-wider text-amber-700 uppercase dark:text-amber-400"
								>Pending</span
							>
						</Tooltip>
					{:else if isPushing}
						<span class="loading loading-xs loading-spinner text-primary"></span>
					{:else if pushState === 'success'}
						<svg
							xmlns="http://www.w3.org/2000/svg"
							width="12"
							height="12"
							viewBox="0 0 24 24"
							fill="none"
							stroke="currentColor"
							stroke-width="2.5"
							stroke-linecap="round"
							stroke-linejoin="round"
							class="text-emerald-600 transition-opacity dark:text-emerald-400"
							><path d="M20 6 9 17l-5-5" /></svg
						>
					{:else if hasDrift}
						<Tooltip
							text="This setting's value was changed directly on the device since the last sync."
						>
							<span
								class="bright-badge rounded-md bg-cyan-500/15 px-1.5 py-0.5 text-[0.6rem] font-semibold tracking-wider text-cyan-700 uppercase dark:text-cyan-400"
								>Changed on device</span
							>
						</Tooltip>
					{/if}
					{#if isAdvanced}
						<Tooltip text={advancedTooltip}>
							<span
								class="bright-badge rounded-md bg-primary/15 px-1.5 py-0.5 text-[0.6rem] font-semibold tracking-wider text-primary uppercase"
								>Advanced</span
							>
						</Tooltip>
					{/if}
					{#if needsOffroad && !ruleContext.isOffroad}
						<Tooltip text="Requires Always Offroad or the car powered off.">
							<span
								class="bright-badge rounded-md bg-amber-500/15 px-1.5 py-0.5 text-[0.6rem] font-semibold tracking-wider text-amber-700 uppercase dark:text-amber-400"
								>Offroad</span
							>
						</Tooltip>
					{/if}
					{#if isDeviceOnly}
						<Tooltip text="This setting can only be changed on the device.">
							<span
								class="bright-badge rounded-md bg-blue-500/15 px-1.5 py-0.5 text-[0.6rem] font-semibold tracking-wider text-blue-700 uppercase dark:text-blue-400"
								>Device only</span
							>
						</Tooltip>
					{:else if disabledReasons.length > 0}
						<Tooltip text={disabledReasons.join('. ')}>
							<span
								class="bright-badge rounded-md bg-amber-500/15 px-1.5 py-0.5 text-[0.6rem] font-semibold tracking-wider text-amber-700 uppercase dark:text-amber-400"
								>Unavailable</span
							>
						</Tooltip>
					{/if}
					{#if item.needs_onroad_cycle && enabled && !isDeviceOnly}
						<Tooltip
							text="Takes effect after the next device reboot. If your car is on, you'll need to disengage and reboot the device."
						>
							<span
								class="bright-badge rounded-md bg-orange-500/15 px-1.5 py-0.5 text-[0.6rem] font-semibold tracking-wider text-orange-700 uppercase dark:text-orange-400"
								>Reboot to apply</span
							>
						</Tooltip>
					{/if}
				</div>
				{#if item.description}
					<p class="mt-0.5 text-[0.75rem] leading-snug font-[450] text-[var(--sl-text-3)]">
						{@html sanitizeDescription(item.description)}
					</p>
				{/if}
			</div>
			<div class="flex shrink-0 items-center">
				{#if isLoading}
					<div class="skeleton-shimmer h-[26px] w-[44px] rounded-full"></div>
				{:else}
					{@const toggleTrackClass = isOn
						? 'bg-primary'
						: !enabled
							? 'bg-[var(--sl-toggle-off-disabled)]'
							: 'bg-[var(--sl-toggle-off)]'}
					<button
						class="relative inline-flex h-[26px] w-[44px] shrink-0 cursor-pointer items-center rounded-full {toggleTrackClass} transition-opacity duration-200"
						style="transition: background-color var(--dur-normal) var(--ease-out);"
						class:opacity-50={isPushing}
						class:cursor-not-allowed={!enabled || isPushing}
						class:pointer-events-none={isPushing || !enabled}
						disabled={!enabled || isPushing}
						role="switch"
						aria-checked={isOn}
						aria-label={displayTitle}
						onclick={() => {
							if (enabled && !isPushing) handleChange(!isOn);
						}}
					>
						<span
							class="absolute top-[2px] left-[2px] h-[22px] w-[22px] rounded-full bg-white shadow-sm"
							class:translate-x-[18px]={isOn}
							style="transition: transform var(--dur-normal) var(--ease-spring);"
						></span>
					</button>
				{/if}
			</div>
		</div>
	{:else if item.widget === 'option' && item.options && !(item.min !== undefined && item.max !== undefined)}
		<!-- ── Dropdown Row (Linear-style inline select) ────────────────── -->
		<div class="flex items-center justify-between gap-4 px-4 py-3.5">
			<div class="min-w-0 flex-1">
				<div class="flex flex-wrap items-center gap-x-2 gap-y-1">
					<span class="text-[0.8125rem] font-medium text-[var(--sl-text-1)]">{displayTitle}</span
					>{@render detailsBtn()}
					{#if isBlocked}
						<Tooltip
							text="Blocked — this setting requires offroad. Will sync when the car is powered off."
						>
							<span
								class="rounded-full bg-red-500/15 px-1.5 py-0.5 text-[0.625rem] leading-none font-semibold text-red-700 dark:text-red-400"
								>Blocked</span
							>
						</Tooltip>
						<button
							class="rounded-full bg-[var(--sl-bg-subtle)] px-1.5 py-0.5 text-[0.625rem] leading-none font-medium text-[var(--sl-text-2)] transition-all duration-100 hover:bg-[var(--sl-bg-elevated)] hover:text-[var(--sl-text-1)] active:scale-[0.92] active:bg-[var(--sl-bg-elevated)]"
							onclick={handleRevert}>Revert</button
						>
					{:else if isQueued || pushState === 'pending'}
						<Tooltip text="Changes queued — will sync to device when pushed.">
							<span
								class="rounded-full bg-amber-500/15 px-1.5 py-0.5 text-[0.625rem] leading-none font-semibold tracking-wider text-amber-700 uppercase dark:text-amber-400"
								>Pending</span
							>
						</Tooltip>
					{:else if isPushing}
						<span class="loading loading-xs loading-spinner text-primary"></span>
					{:else if pushState === 'success'}
						<svg
							xmlns="http://www.w3.org/2000/svg"
							width="12"
							height="12"
							viewBox="0 0 24 24"
							fill="none"
							stroke="currentColor"
							stroke-width="2.5"
							stroke-linecap="round"
							stroke-linejoin="round"
							class="text-emerald-500"><path d="M20 6 9 17l-5-5" /></svg
						>
					{:else if hasDrift}
						<Tooltip
							text="This setting's value was changed directly on the device since the last sync."
						>
							<span
								class="bright-badge rounded-md bg-cyan-500/15 px-1.5 py-0.5 text-[0.6rem] font-semibold tracking-wider text-cyan-700 uppercase dark:text-cyan-400"
								>Changed on device</span
							>
						</Tooltip>
					{/if}
					{#if isAdvanced}
						<Tooltip text={advancedTooltip}>
							<span
								class="bright-badge rounded-md bg-primary/15 px-1.5 py-0.5 text-[0.6rem] font-semibold tracking-wider text-primary uppercase"
								>Advanced</span
							>
						</Tooltip>
					{/if}
					{#if needsOffroad && !ruleContext.isOffroad}
						<Tooltip text="Requires Always Offroad or the car powered off.">
							<span
								class="bright-badge rounded-md bg-amber-500/15 px-1.5 py-0.5 text-[0.6rem] font-semibold tracking-wider text-amber-700 uppercase dark:text-amber-400"
								>Offroad</span
							>
						</Tooltip>
					{/if}
					{#if isDeviceOnly}
						<Tooltip text="This setting can only be changed on the device.">
							<span
								class="bright-badge rounded-md bg-blue-500/15 px-1.5 py-0.5 text-[0.6rem] font-semibold tracking-wider text-blue-700 uppercase dark:text-blue-400"
								>Device only</span
							>
						</Tooltip>
					{:else if disabledReasons.length > 0}
						<Tooltip text={disabledReasons.join('. ')}>
							<span
								class="bright-badge rounded-md bg-amber-500/15 px-1.5 py-0.5 text-[0.6rem] font-semibold tracking-wider text-amber-700 uppercase dark:text-amber-400"
								>Unavailable</span
							>
						</Tooltip>
					{/if}
					{#if item.needs_onroad_cycle && enabled && !isDeviceOnly}
						<Tooltip
							text="Takes effect after the next device reboot. If your car is on, you'll need to disengage and reboot the device."
						>
							<span
								class="bright-badge rounded-md bg-orange-500/15 px-1.5 py-0.5 text-[0.6rem] font-semibold tracking-wider text-orange-700 uppercase dark:text-orange-400"
								>Reboot to apply</span
							>
						</Tooltip>
					{/if}
				</div>
				{#if item.description}
					<p class="mt-0.5 text-[0.75rem] leading-snug font-[450] text-[var(--sl-text-3)]">
						{@html sanitizeDescription(item.description)}
					</p>
				{/if}
			</div>
			<div class="shrink-0">
				{#if isLoading}
					<div class="skeleton-shimmer h-8 w-20 rounded-lg"></div>
				{:else}
					<SelectDropdown
						options={item.options}
						value={displayValue}
						disabled={!enabled || isPushing}
						disabledValues={disabledOptionValues}
						title={displayTitle}
						onchange={(val) => {
							const numVal = Number(val);
							handleChange(isNaN(numVal) ? val : numVal);
						}}
					/>
				{/if}
			</div>
		</div>
	{:else if item.widget === 'option' && item.min !== undefined && item.max !== undefined}
		<!-- ── Slider Row (range input below label) ────────────────────── -->
		<div class="px-4 py-4">
			<div class="flex flex-wrap items-center gap-x-2 gap-y-1">
				<span class="text-[0.8125rem] font-medium text-[var(--sl-text-1)]">{displayTitle}</span
				>{@render detailsBtn()}
				{#if isQueued || pushState === 'pending'}
					<Tooltip text="Changes queued — will sync to device when pushed.">
						<span
							class="rounded-full bg-amber-500/15 px-1.5 py-0.5 text-[0.625rem] leading-none font-semibold tracking-wider text-amber-700 uppercase dark:text-amber-400"
							>Pending</span
						>
					</Tooltip>
				{:else if isPushing}
					<span class="loading loading-xs loading-spinner text-primary"></span>
				{:else if pushState === 'success'}
					<svg
						xmlns="http://www.w3.org/2000/svg"
						width="12"
						height="12"
						viewBox="0 0 24 24"
						fill="none"
						stroke="currentColor"
						stroke-width="2.5"
						stroke-linecap="round"
						stroke-linejoin="round"
						class="text-emerald-500"><path d="M20 6 9 17l-5-5" /></svg
					>
				{:else if hasDrift}
					<Tooltip
						text="This setting's value was changed directly on the device since the last sync."
					>
						<span
							class="bright-badge rounded-md bg-cyan-500/15 px-1.5 py-0.5 text-[0.6rem] font-semibold tracking-wider text-cyan-700 uppercase dark:text-cyan-400"
							>Changed on device</span
						>
					</Tooltip>
				{/if}
				{#if isAdvanced}
					<Tooltip text={advancedTooltip}>
						<span
							class="bright-badge rounded-md bg-primary/15 px-1.5 py-0.5 text-[0.6rem] font-semibold tracking-wider text-primary uppercase"
							>Advanced</span
						>
					</Tooltip>
				{/if}
				{#if needsOffroad && !ruleContext.isOffroad}
					<Tooltip text="Requires Always Offroad or the car powered off.">
						<span
							class="bright-badge rounded-md bg-amber-500/15 px-1.5 py-0.5 text-[0.6rem] font-semibold tracking-wider text-amber-700 uppercase dark:text-amber-400"
							>Offroad</span
						>
					</Tooltip>
				{/if}
				{#if disabledReasons.length > 0}
					<Tooltip text={disabledReasons.join('. ')}>
						<span
							class="bright-badge rounded-md bg-amber-500/15 px-1.5 py-0.5 text-[0.6rem] font-semibold tracking-wider text-amber-700 uppercase dark:text-amber-400"
							>Unavailable</span
						>
					</Tooltip>
				{/if}
				{#if item.needs_onroad_cycle && enabled && !isDeviceOnly}
					<Tooltip
						text="Takes effect after the next device reboot. If your car is on, you'll need to disengage and reboot the device."
					>
						<span
							class="bright-badge rounded-md bg-orange-500/15 px-1.5 py-0.5 text-[0.6rem] font-semibold tracking-wider text-orange-700 uppercase dark:text-orange-400"
							>Reboot to apply</span
						>
					</Tooltip>
				{/if}
			</div>
			{#if item.description}
				<p class="mt-0.5 text-[0.75rem] leading-snug font-[450] text-[var(--sl-text-3)]">
					{@html sanitizeDescription(item.description)}
				</p>
			{/if}

			<div class="mt-2.5">
				{#if isLoading}
					<div class="skeleton-shimmer h-8 w-full rounded-lg"></div>
				{:else}
					<div class="flex w-full flex-col gap-2">
						<div class="flex items-center justify-between text-xs text-[var(--sl-text-3)]">
							<span>{isFloat ? Number(item.min).toFixed(2) : item.min}</span>
							<span
								class="text-sm font-semibold tabular-nums transition-colors"
								class:text-primary={sliderPreview === null}
								class:text-[var(--sl-text-1)]={sliderPreview !== null}
							>
								{formatDisplay(
									sliderPreview ?? (displayValue !== undefined ? displayValue : item.min)
								)}
								{#if resolvedUnit}<span class="ml-0.5 text-xs font-normal text-[var(--sl-text-3)]"
										>{resolvedUnit}</span
									>{/if}
							</span>
							<span>{isFloat ? Number(item.max).toFixed(2) : item.max}</span>
						</div>
						<div
							class="flex items-center gap-2 transition-opacity duration-200"
							class:opacity-50={isPushing}
							class:pointer-events-none={isPushing || !enabled}
						>
							<button
								class="flex h-10 w-10 items-center justify-center rounded-lg text-[var(--sl-text-3)] transition-all duration-100 hover:bg-[var(--sl-bg-elevated)] hover:text-[var(--sl-text-1)] active:scale-[0.88] active:bg-[var(--sl-bg-subtle)] disabled:active:scale-100"
								disabled={!enabled || isPushing}
								onclick={() => {
									const current =
										displayValue !== undefined ? Number(displayValue) : Number(item.min);
									const nv = Math.max(item.min!, current - (item.step || 1));
									handleChange(isFloat ? parseFloat(nv.toFixed(2)) : nv);
								}}
							>
								<svg
									xmlns="http://www.w3.org/2000/svg"
									width="14"
									height="14"
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
								disabled={!enabled || isPushing}
								onpointerdown={startSliderDrag}
								onkeydown={(e) => {
									if (
										e.key === 'ArrowLeft' ||
										e.key === 'ArrowRight' ||
										e.key === 'ArrowUp' ||
										e.key === 'ArrowDown' ||
										e.key === 'Home' ||
										e.key === 'End' ||
										e.key === 'PageUp' ||
										e.key === 'PageDown'
									) {
										startSliderDrag();
									}
								}}
								onkeyup={endSliderDrag}
								onblur={endSliderDrag}
								oninput={(e) => {
									const val = (e.currentTarget as HTMLInputElement).value;
									sliderPreview = isFloat ? parseFloat(val) : parseInt(val, 10);
								}}
								onchange={(e) => {
									const val = (e.currentTarget as HTMLInputElement).value;
									const numVal = isFloat ? parseFloat(val) : parseInt(val, 10);
									sliderPreview = null;
									handleChange(numVal);
								}}
							/>
							<button
								class="flex h-10 w-10 items-center justify-center rounded-lg text-[var(--sl-text-3)] transition-all duration-100 hover:bg-[var(--sl-bg-elevated)] hover:text-[var(--sl-text-1)] active:scale-[0.88] active:bg-[var(--sl-bg-subtle)] disabled:active:scale-100"
								disabled={!enabled || isPushing}
								onclick={() => {
									const current =
										displayValue !== undefined ? Number(displayValue) : Number(item.min);
									const nv = Math.min(item.max!, current + (item.step || 1));
									handleChange(isFloat ? parseFloat(nv.toFixed(2)) : nv);
								}}
							>
								<svg
									xmlns="http://www.w3.org/2000/svg"
									width="14"
									height="14"
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
				{/if}
			</div>
		</div>
	{:else if item.widget === 'option'}
		<!-- ── Option Display-Only Row (inline right-aligned value) ────── -->
		<div class="flex w-full items-center justify-between px-4 py-4">
			<div class="mr-4 min-w-0 flex-1">
				<div class="flex flex-wrap items-center gap-x-2 gap-y-1">
					<span class="text-[0.8125rem] font-medium text-[var(--sl-text-1)]">{displayTitle}</span
					>{@render detailsBtn()}
					{#if isBlocked}
						<Tooltip
							text="Blocked — this setting requires offroad. Will sync when the car is powered off."
						>
							<span
								class="rounded-full bg-red-500/15 px-1.5 py-0.5 text-[0.625rem] leading-none font-semibold text-red-700 dark:text-red-400"
								>Blocked</span
							>
						</Tooltip>
						<button
							class="rounded-full bg-[var(--sl-bg-subtle)] px-1.5 py-0.5 text-[0.625rem] leading-none font-medium text-[var(--sl-text-2)] transition-all duration-100 hover:bg-[var(--sl-bg-elevated)] hover:text-[var(--sl-text-1)] active:scale-[0.92] active:bg-[var(--sl-bg-elevated)]"
							onclick={handleRevert}>Revert</button
						>
					{:else if isQueued || pushState === 'pending'}
						<Tooltip text="Changes queued — will sync to device when pushed.">
							<span
								class="rounded-full bg-amber-500/15 px-1.5 py-0.5 text-[0.625rem] leading-none font-semibold tracking-wider text-amber-700 uppercase dark:text-amber-400"
								>Pending</span
							>
						</Tooltip>
					{:else if isPushing}
						<span class="loading loading-xs loading-spinner text-primary"></span>
					{:else if pushState === 'success'}
						<svg
							xmlns="http://www.w3.org/2000/svg"
							width="12"
							height="12"
							viewBox="0 0 24 24"
							fill="none"
							stroke="currentColor"
							stroke-width="2.5"
							stroke-linecap="round"
							stroke-linejoin="round"
							class="text-emerald-500"><path d="M20 6 9 17l-5-5" /></svg
						>
					{:else if hasDrift}
						<Tooltip
							text="This setting's value was changed directly on the device since the last sync."
						>
							<span
								class="bright-badge rounded-md bg-cyan-500/15 px-1.5 py-0.5 text-[0.6rem] font-semibold tracking-wider text-cyan-700 uppercase dark:text-cyan-400"
								>Changed on device</span
							>
						</Tooltip>
					{/if}
					{#if isAdvanced}
						<Tooltip text={advancedTooltip}>
							<span
								class="bright-badge rounded-md bg-primary/15 px-1.5 py-0.5 text-[0.6rem] font-semibold tracking-wider text-primary uppercase"
								>Advanced</span
							>
						</Tooltip>
					{/if}
					{#if needsOffroad && !ruleContext.isOffroad}
						<Tooltip text="Requires Always Offroad or the car powered off.">
							<span
								class="bright-badge rounded-md bg-amber-500/15 px-1.5 py-0.5 text-[0.6rem] font-semibold tracking-wider text-amber-700 uppercase dark:text-amber-400"
								>Offroad</span
							>
						</Tooltip>
					{/if}
					{#if isDeviceOnly}
						<Tooltip text="This setting can only be changed on the device.">
							<span
								class="bright-badge rounded-md bg-blue-500/15 px-1.5 py-0.5 text-[0.6rem] font-semibold tracking-wider text-blue-700 uppercase dark:text-blue-400"
								>Device only</span
							>
						</Tooltip>
					{:else if disabledReasons.length > 0}
						<Tooltip text={disabledReasons.join('. ')}>
							<span
								class="bright-badge rounded-md bg-amber-500/15 px-1.5 py-0.5 text-[0.6rem] font-semibold tracking-wider text-amber-700 uppercase dark:text-amber-400"
								>Unavailable</span
							>
						</Tooltip>
					{/if}
					{#if item.needs_onroad_cycle && enabled && !isDeviceOnly}
						<Tooltip
							text="Takes effect after the next device reboot. If your car is on, you'll need to disengage and reboot the device."
						>
							<span
								class="bright-badge rounded-md bg-orange-500/15 px-1.5 py-0.5 text-[0.6rem] font-semibold tracking-wider text-orange-700 uppercase dark:text-orange-400"
								>Reboot to apply</span
							>
						</Tooltip>
					{/if}
				</div>
				{#if item.description}
					<p class="mt-0.5 text-[0.75rem] leading-snug font-[450] text-[var(--sl-text-3)]">
						{@html sanitizeDescription(item.description)}
					</p>
				{/if}
			</div>
			<span class="shrink-0 text-[0.8125rem] font-medium text-[var(--sl-text-2)] tabular-nums">
				{#if isLoading}
					<div class="skeleton-shimmer h-4 w-12 rounded"></div>
				{:else}
					{formatDisplay(displayValue)}{#if resolvedUnit}<span
							class="ml-0.5 text-[var(--sl-text-3)]">{resolvedUnit}</span
						>{/if}
				{/if}
			</span>
		</div>
	{:else if item.widget === 'multiple_button'}
		<!-- ── Multi-choice Row (right-aligned: compact segmented if labels fit, dropdown otherwise) ── -->
		<div class="flex items-center justify-between gap-4 px-4 py-3.5">
			<div class="min-w-0 flex-1">
				<div class="flex flex-wrap items-center gap-x-2 gap-y-1">
					<span class="text-[0.8125rem] font-medium text-[var(--sl-text-1)]">{displayTitle}</span
					>{@render detailsBtn()}
					{#if isQueued || pushState === 'pending'}
						<Tooltip text="Changes queued — will sync to device when pushed.">
							<span
								class="rounded-full bg-amber-500/15 px-1.5 py-0.5 text-[0.625rem] leading-none font-semibold tracking-wider text-amber-700 uppercase dark:text-amber-400"
								>Pending</span
							>
						</Tooltip>
					{:else if isPushing}
						<span class="loading loading-xs loading-spinner text-primary"></span>
					{:else if pushState === 'success'}
						<svg
							xmlns="http://www.w3.org/2000/svg"
							width="12"
							height="12"
							viewBox="0 0 24 24"
							fill="none"
							stroke="currentColor"
							stroke-width="2.5"
							stroke-linecap="round"
							stroke-linejoin="round"
							class="text-emerald-500"><path d="M20 6 9 17l-5-5" /></svg
						>
					{:else if hasDrift}
						<Tooltip
							text="This setting's value was changed directly on the device since the last sync."
						>
							<span
								class="bright-badge rounded-md bg-cyan-500/15 px-1.5 py-0.5 text-[0.6rem] font-semibold tracking-wider text-cyan-700 uppercase dark:text-cyan-400"
								>Changed on device</span
							>
						</Tooltip>
					{/if}
					{#if isAdvanced}
						<Tooltip text={advancedTooltip}>
							<span
								class="bright-badge rounded-md bg-primary/15 px-1.5 py-0.5 text-[0.6rem] font-semibold tracking-wider text-primary uppercase"
								>Advanced</span
							>
						</Tooltip>
					{/if}
					{#if needsOffroad && !ruleContext.isOffroad}
						<Tooltip text="Requires Always Offroad or the car powered off.">
							<span
								class="bright-badge rounded-md bg-amber-500/15 px-1.5 py-0.5 text-[0.6rem] font-semibold tracking-wider text-amber-700 uppercase dark:text-amber-400"
								>Offroad</span
							>
						</Tooltip>
					{/if}
					{#if disabledReasons.length > 0}
						<Tooltip text={disabledReasons.join('. ')}>
							<span
								class="bright-badge rounded-md bg-amber-500/15 px-1.5 py-0.5 text-[0.6rem] font-semibold tracking-wider text-amber-700 uppercase dark:text-amber-400"
								>Unavailable</span
							>
						</Tooltip>
					{/if}
					{#if item.needs_onroad_cycle && enabled && !isDeviceOnly}
						<Tooltip
							text="Takes effect after the next device reboot. If your car is on, you'll need to disengage and reboot the device."
						>
							<span
								class="bright-badge rounded-md bg-orange-500/15 px-1.5 py-0.5 text-[0.6rem] font-semibold tracking-wider text-orange-700 uppercase dark:text-orange-400"
								>Reboot to apply</span
							>
						</Tooltip>
					{/if}
				</div>
				{#if item.description}
					<p class="mt-0.5 text-[0.75rem] leading-snug font-[450] text-[var(--sl-text-3)]">
						{@html sanitizeDescription(item.description)}
					</p>
				{/if}
			</div>
			<div class="shrink-0">
				{#if isLoading}
					<div class="skeleton-shimmer h-9 w-32 rounded-lg"></div>
				{:else if item.options && useDropdownForSegments}
					<!-- Dropdown fallback when too many / too long options for compact segmented -->
					<SelectDropdown
						options={item.options}
						value={displayValue}
						disabled={!enabled || isPushing}
						disabledValues={disabledOptionValues}
						title={displayTitle}
						onchange={(val) => {
							const numVal = Number(val);
							handleChange(isNaN(numVal) ? val : numVal);
						}}
					/>
				{:else if item.options}
					{@const selectedIdx = item.options.findIndex(
						(o) => String(displayValue) === String(o.value)
					)}
					{@const optCount = item.options.length}
					<div
						class="relative flex min-w-[140px] rounded-lg bg-[var(--sl-bg-input)] p-1 transition-opacity duration-200"
						class:opacity-50={isPushing}
						class:pointer-events-none={isPushing || !enabled}
					>
						{#if selectedIdx >= 0}
							<!-- Disabled: neutral fill (toggle-off token). bg-primary at 40% parent dim
							     still reads as saturated purple, undercutting the "unavailable" signal. -->
							<div
								class="absolute top-1 bottom-1 rounded-md shadow-sm transition-transform duration-350 ease-out {enabled
									? 'bg-primary'
									: 'bg-[var(--sl-toggle-off)]'}"
								style="width: calc((100% - 0.5rem) / {optCount}); transform: translateX(calc({selectedIdx} * 100%));"
							></div>
						{/if}
						{#each item.options as option, oi}
							{@const isSelected = oi === selectedIdx}
							{@const optEnabled = isOptionEnabled(option)}
							<button
								class="relative z-10 min-w-0 flex-1 truncate rounded-md py-2 font-medium transition-colors duration-350 {useCompactSegments
									? 'px-2 text-[0.8125rem] tracking-tight'
									: 'px-3 text-sm'}"
								class:text-white={isSelected && optEnabled && enabled}
								class:text-[var(--sl-text-2)]={(!isSelected && optEnabled && enabled) || !enabled}
								class:hover:text-[var(--sl-text-1)]={!isSelected &&
									enabled &&
									optEnabled &&
									!isPushing}
								class:opacity-30={!optEnabled && enabled}
								class:cursor-not-allowed={!optEnabled || !enabled}
								class:pointer-events-none={isPushing || !enabled}
								disabled={!enabled || isPushing || !optEnabled}
								aria-disabled={!optEnabled || !enabled}
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
		<!-- ── Info Row (inline right-aligned value) ───────────────────── -->
		<div class="flex w-full items-center justify-between px-4 py-4">
			<div class="mr-4 min-w-0 flex-1">
				<span class="text-[0.8125rem] font-medium text-[var(--sl-text-1)]">{displayTitle}</span
				>{@render detailsBtn()}
				{#if item.description}
					<span class="ml-1.5 text-[0.75rem] font-[450] text-[var(--sl-text-3)]"
						>{@html sanitizeDescription(item.description)}</span
					>
				{/if}
			</div>
			<span class="shrink-0 text-[0.8125rem] font-medium text-[var(--sl-text-2)] tabular-nums">
				{formatDisplay(displayValue)}
			</span>
		</div>
	{/if}

	{#if showDivider}
		<div class="setting-divider mx-4 border-b border-[var(--sl-border-muted)]"></div>
	{/if}

	{#if item.details}
		<InfoDetailsModal bind:open={detailsOpen} title={displayTitle} details={item.details} />
	{/if}
</div>

{#if item.sub_items}
	{#each item.sub_items as subItem, i (subItem.key)}
		<svelte:self
			{deviceId}
			item={subItem}
			{loadingValues}
			{readonly}
			isLast={i === item.sub_items.length - 1 && isLast}
		/>
	{/each}
{/if}

<style>
	/* Dim everything inside .setting-dimmed except .bright-badge elements.
	   At each level, dim children that don't contain a badge; drill into
	   children that DO contain a badge and repeat. This avoids compounding
	   because only leaf-level (badge-free) elements get opacity applied. */
	:global(.setting-dimmed) > :global(*:not(:has(.bright-badge)):not(.setting-divider)) {
		opacity: 0.4;
	}
	:global(.setting-dimmed)
		> :global(*:has(.bright-badge))
		> :global(*:not(:has(.bright-badge)):not(.bright-badge)) {
		opacity: 0.4;
	}
	:global(.setting-dimmed)
		> :global(*:has(.bright-badge))
		> :global(*:has(.bright-badge))
		> :global(*:not(:has(.bright-badge)):not(.bright-badge)) {
		opacity: 0.4;
	}
	:global(.setting-dimmed)
		> :global(*:has(.bright-badge))
		> :global(*:has(.bright-badge))
		> :global(*:has(.bright-badge))
		> :global(*:not(:has(.bright-badge)):not(.bright-badge)) {
		opacity: 0.4;
	}
</style>
