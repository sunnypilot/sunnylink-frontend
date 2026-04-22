<script lang="ts">
	import { deviceState } from '$lib/stores/device.svelte';
	import { statusPolling } from '$lib/stores/statusPolling.svelte';
	import { formatRelativeTime } from '$lib/utils/time';
	import { Loader2, ChevronRight, ArrowLeftRight } from 'lucide-svelte';
	import MarqueeText from '$lib/components/MarqueeText.svelte';
	import LegacyDeviceBadge from '$lib/components/LegacyDeviceBadge.svelte';
	import { getDeviceDisplayName, getDeviceTypeLabel } from '$lib/utils/deviceDisplay';

	let { device } = $props<{ device: any }>();

	let alias = $derived(getDeviceDisplayName(device.device_id, device.alias));

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

	let deviceType = $derived(
		getDeviceTypeLabel(deviceState.deviceTelemetry[device.device_id]?.deviceType)
	);
</script>

<section
	class="rounded-2xl border border-[var(--sl-border)] bg-[var(--sl-bg-surface)] p-4 sm:p-5 {isOffline
		? 'opacity-80'
		: ''}"
	aria-labelledby="hero-alias"
>
	<div class="flex items-start justify-between gap-3">
		<!-- Status dot anchored next to the alias — matches the My Devices row
		     layout so Home and My Devices read as the same object in two contexts. -->
		<div class="flex min-w-0 flex-1 items-center gap-3 pr-2">
			<span
				class="block h-2.5 w-2.5 shrink-0 rounded-full {statusDotClass}"
				class:animate-pulse={isLoading}
				aria-hidden="true"
			></span>
			<div class="min-w-0 flex-1">
				<h1
					id="hero-alias"
					class="truncate text-[1.125rem] leading-tight font-semibold tracking-[-0.01em] text-[var(--sl-text-1)]"
				>
					{alias}
				</h1>
				<p class="mt-0.5 truncate font-mono text-[0.6875rem] text-[var(--sl-text-3)]">
					{device.device_id}
				</p>
			</div>
		</div>
		<a
			href="/dashboard/devices"
			class="inline-flex shrink-0 items-center gap-1.5 rounded-md border border-[var(--sl-border)] px-2.5 py-1 text-[0.75rem] font-medium text-[var(--sl-text-1)] transition-all duration-100 hover:bg-[var(--sl-bg-elevated)] focus-visible:outline-2 focus-visible:outline-primary active:scale-[0.92] active:bg-[var(--sl-bg-subtle)]"
			aria-label="Change selected device"
		>
			<ArrowLeftRight size={12} aria-hidden="true" />
			<span class="hidden sm:inline">Change device</span>
			<span class="sm:hidden">Change</span>
		</a>
	</div>

	{#key statusPolling.tickCounter}
		<div class="mt-2 flex flex-wrap items-center gap-x-1.5 text-[0.75rem] text-[var(--sl-text-3)]">
			<span class="text-[var(--sl-text-2)]">{statusLabel}</span>
			{#if isLoading}
				<Loader2
					size={11}
					class="shrink-0 animate-spin text-[var(--sl-text-3)]"
					aria-hidden="true"
				/>
			{/if}
			{#if deviceType}
				<span aria-hidden="true">·</span>
				<span>{deviceType}</span>
			{/if}
			{#if lastSeen}
				<span aria-hidden="true">·</span>
				<span>Last seen {lastSeen}</span>
			{/if}
		</div>
	{/key}

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
