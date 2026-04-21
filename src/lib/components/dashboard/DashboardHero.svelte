<script lang="ts">
	import { deviceState } from '$lib/stores/device.svelte';
	import { statusPolling } from '$lib/stores/statusPolling.svelte';
	import { formatRelativeTime } from '$lib/utils/time';
	import { Smartphone, Loader2, ChevronRight, ArrowLeftRight } from 'lucide-svelte';
	import MarqueeText from '$lib/components/MarqueeText.svelte';
	import LegacyDeviceBadge from '$lib/components/LegacyDeviceBadge.svelte';

	let { device } = $props<{ device: any }>();

	const DEVICE_TYPE_NAMES: Record<string, string> = {
		tizi: 'comma 3X',
		mici: 'comma four',
		tici: 'comma three',
		pc: 'PC'
	};

	let alias = $derived(deviceState.aliases[device.device_id] ?? device.alias ?? device.device_id);

	let onlineStatus = $derived(deviceState.onlineStatuses[device.device_id]);
	let offroadStatus = $derived(deviceState.offroadStatuses[device.device_id]);
	let values = $derived(deviceState.deviceValues[device.device_id]);

	let isLoading = $derived(!onlineStatus || onlineStatus === 'loading');
	let isOffline = $derived(onlineStatus === 'offline');

	let version = $derived((values?.['Version'] as string | undefined) ?? null);
	let branch = $derived((values?.['GitBranch'] as string | undefined) ?? null);
	let commit = $derived((values?.['GitCommit'] as string | undefined)?.slice(0, 7) ?? null);
	// Skeleton/value/dash gating: skeleton until the device's info-keys fetch
	// resolves (success or failure), then show the value or "—" if missing.
	let infoLoaded = $derived(deviceState.infoFetchComplete[device.device_id] === true);

	let statusLabel = $derived.by(() => {
		if (isLoading) return 'Checking…';
		if (onlineStatus === 'offline') return 'Offline';
		if (onlineStatus === 'error') return 'Error';
		if (offroadStatus?.forceOffroad) return 'Online · Always Offroad';
		if (offroadStatus?.isOffroad === false) return 'Online · Onroad';
		if (offroadStatus?.isOffroad === true) return 'Online · Offroad';
		return 'Online';
	});

	let statusDotClass = $derived.by(() => {
		if (isLoading) return 'bg-[var(--sl-text-3)] animate-pulse';
		if (onlineStatus === 'offline') return 'bg-red-400';
		if (onlineStatus === 'error') return 'bg-amber-400';
		if (offroadStatus?.forceOffroad) return 'bg-amber-400';
		if (offroadStatus?.isOffroad === false) return 'bg-blue-400';
		return 'bg-emerald-400';
	});

	let lastSeen = $derived.by(() => {
		const ts =
			onlineStatus === 'online'
				? (deviceState.lastStatusCheck[device.device_id] ?? null)
				: (deviceState.lastSeenOnline[device.device_id] ?? null);
		if (!ts) return null;
		return formatRelativeTime(ts);
	});

	let deviceType = $derived.by(() => {
		const t = deviceState.deviceTelemetry[device.device_id]?.deviceType;
		if (!t || t === 'unknown') return null;
		return DEVICE_TYPE_NAMES[t.toLowerCase()] ?? null;
	});
</script>

<section
	class="rounded-2xl border border-[var(--sl-border)] bg-[var(--sl-bg-surface)] p-4 sm:p-5 {isOffline
		? 'opacity-80'
		: ''}"
	aria-labelledby="hero-alias"
>
	<div class="flex items-start gap-3">
		<div
			class="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary"
		>
			<Smartphone size={22} aria-hidden="true" />
		</div>
		<div class="min-w-0 flex-1">
			<div class="flex items-center justify-between gap-2">
				<h1
					id="hero-alias"
					class="truncate text-[1.125rem] leading-tight font-semibold tracking-[-0.01em] text-[var(--sl-text-1)]"
				>
					{alias}
				</h1>
				<a
					href="/dashboard/devices"
					class="inline-flex shrink-0 items-center gap-1.5 rounded-md border border-[var(--sl-border)] bg-[var(--sl-bg-elevated)] px-2.5 py-1 text-[0.75rem] font-medium text-[var(--sl-text-2)] transition-all duration-100 hover:bg-[var(--sl-bg-subtle)] hover:text-[var(--sl-text-1)] focus-visible:outline-2 focus-visible:outline-primary active:scale-[0.96] active:bg-[var(--sl-bg-subtle)]"
					aria-label="Change selected device"
				>
					<ArrowLeftRight size={12} aria-hidden="true" />
					<span class="hidden sm:inline">Change device</span>
					<span class="sm:hidden">Change</span>
				</a>
			</div>
			<div class="mt-1 flex items-center gap-1.5">
				<span class="block h-2 w-2 shrink-0 rounded-full {statusDotClass}" aria-hidden="true"
				></span>
				<span class="text-[0.8125rem] text-[var(--sl-text-2)]">{statusLabel}</span>
				{#if isLoading}
					<Loader2
						size={12}
						class="shrink-0 animate-spin text-[var(--sl-text-3)]"
						aria-hidden="true"
					/>
				{/if}
			</div>
			{#if deviceType || lastSeen}
				{#key statusPolling.tickCounter}
					<p class="mt-0.5 truncate text-[0.75rem] text-[var(--sl-text-3)]">
						{#if deviceType}{deviceType}{/if}
						{#if deviceType && lastSeen}
							·
						{/if}
						{#if lastSeen}Last seen {lastSeen}{/if}
					</p>
				{/key}
			{/if}
		</div>
	</div>

	<dl
		class="mt-4 grid grid-cols-3 gap-2 rounded-xl bg-[var(--sl-bg-elevated)]/60 p-3"
		aria-label="Device build info"
	>
		<div class="min-w-0">
			<dt class="text-[0.6875rem] tracking-wider text-[var(--sl-text-3)] uppercase">Version</dt>
			<dd class="mt-0.5 truncate text-[0.8125rem] font-medium text-[var(--sl-text-1)]">
				{#if !infoLoaded}
					<span
						class="inline-block h-3 w-16 animate-pulse rounded bg-[var(--sl-bg-elevated)]/80"
						aria-hidden="true"
					></span>
					<span class="sr-only">Loading version</span>
				{:else}
					{version ?? '—'}
				{/if}
			</dd>
		</div>
		<div class="min-w-0">
			<dt class="text-[0.6875rem] tracking-wider text-[var(--sl-text-3)] uppercase">Branch</dt>
			<dd class="mt-0.5 min-w-0 text-[0.8125rem] font-medium text-[var(--sl-text-1)]">
				{#if !infoLoaded}
					<span
						class="inline-block h-3 w-20 animate-pulse rounded bg-[var(--sl-bg-elevated)]/80"
						aria-hidden="true"
					></span>
					<span class="sr-only">Loading branch</span>
				{:else if branch}
					<MarqueeText
						text={branch}
						mono
						className="text-[0.8125rem] font-medium text-[var(--sl-text-1)]"
					/>
				{:else}
					—
				{/if}
			</dd>
		</div>
		<div class="min-w-0">
			<dt class="text-[0.6875rem] tracking-wider text-[var(--sl-text-3)] uppercase">Commit</dt>
			<dd class="mt-0.5 truncate font-mono text-[0.8125rem] font-medium text-[var(--sl-text-1)]">
				{#if !infoLoaded}
					<span
						class="inline-block h-3 w-14 animate-pulse rounded bg-[var(--sl-bg-elevated)]/80"
						aria-hidden="true"
					></span>
					<span class="sr-only">Loading commit</span>
				{:else}
					{commit ?? '—'}
				{/if}
			</dd>
		</div>
	</dl>

	<LegacyDeviceBadge deviceId={device.device_id} variant="banner" className="mt-3" />

	<a
		href="/dashboard/devices/{device.device_id}/about"
		class="mt-3 flex w-full items-center justify-between rounded-xl border border-[var(--sl-border)] bg-[var(--sl-bg-elevated)]/40 px-4 py-2.5 text-[0.8125rem] font-medium text-[var(--sl-text-2)] transition-all duration-100 hover:bg-[var(--sl-bg-subtle)] hover:text-[var(--sl-text-1)] focus-visible:outline-2 focus-visible:outline-primary active:scale-[0.99] active:bg-[var(--sl-bg-subtle)]"
		aria-label="More about this device"
	>
		<span>More about this device</span>
		<ChevronRight size={14} aria-hidden="true" />
	</a>
</section>
