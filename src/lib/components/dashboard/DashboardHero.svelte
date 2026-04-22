<script lang="ts">
	import { deviceState } from '$lib/stores/device.svelte';
	import { statusPolling } from '$lib/stores/statusPolling.svelte';
	import { ChevronRight } from 'lucide-svelte';
	import MarqueeText from '$lib/components/MarqueeText.svelte';
	import LegacyDeviceBadge from '$lib/components/LegacyDeviceBadge.svelte';
	import DeviceStatusBadge from '$lib/components/DeviceStatusBadge.svelte';
	import { getDeviceDisplayName } from '$lib/utils/deviceDisplay';
	import { getConnectivityBadge, getDrivingBadge } from '$lib/utils/deviceBadges';

	let { device } = $props<{ device: any }>();

	let alias = $derived(getDeviceDisplayName(device.device_id, device.alias));

	let onlineStatus = $derived(deviceState.onlineStatuses[device.device_id]);
	let values = $derived(deviceState.deviceValues[device.device_id]);

	let isLoading = $derived(!onlineStatus || onlineStatus === 'loading');
	let isOffline = $derived(onlineStatus === 'offline');

	let version = $derived((values?.['Version'] as string | undefined) ?? null);
	let branch = $derived((values?.['GitBranch'] as string | undefined) ?? null);
	let commit = $derived((values?.['GitCommit'] as string | undefined)?.slice(0, 7) ?? null);
	// Skeleton/value/dash gating: skeleton until the device's info-keys fetch
	// resolves (success or failure), then show the value or "—" if missing.
	let infoLoaded = $derived(deviceState.infoFetchComplete[device.device_id] === true);

	let statusDotClass = $derived.by(() => {
		if (isLoading) return 'bg-[var(--sl-text-3)]';
		if (onlineStatus === 'offline') return 'bg-red-400';
		if (onlineStatus === 'error') return 'bg-amber-400';
		const offroad = deviceState.offroadStatuses[device.device_id];
		if (offroad?.forceOffroad) return 'bg-amber-400';
		if (offroad?.isOffroad === false) return 'bg-blue-400';
		return 'bg-emerald-400';
	});

	let connectivityBadge = $derived(getConnectivityBadge(device.device_id));
	let drivingBadge = $derived(getDrivingBadge(device.device_id));
</script>

<section
	class="overflow-hidden rounded-2xl border border-[var(--sl-border)] bg-[var(--sl-bg-surface)] {isOffline
		? 'opacity-80'
		: ''}"
	aria-labelledby="hero-alias"
>
	<!-- Clickable header bar. Entire row navigates to /details; internal
	     badges are purely visual status indicators and inherit the link click
	     (no separate handlers). Chevron on the right signals tappability,
	     hover state confirms it. -->
	<a
		href="/dashboard/devices/{device.device_id}/details"
		class="group block transition-colors duration-100 hover:bg-[var(--sl-bg-elevated)]/60 focus-visible:bg-[var(--sl-bg-elevated)]/60 focus-visible:outline-none"
		aria-label="Device details for {alias}"
	>
		<div
			class="grid items-start gap-x-4 p-4 sm:p-5"
			style="grid-template-columns: auto minmax(0, 1fr) auto;"
		>
			<span
				class="mt-2 block h-2.5 w-2.5 shrink-0 rounded-full {statusDotClass}"
				class:animate-pulse={isLoading}
				aria-hidden="true"
			></span>

			<!-- Inner 2-col grid so badges wrap per-row: row 1 aligned with alias,
			     row 2 aligned with device_id. Overflowing badges flex-wrap within
			     the row-2 cell and cause that row to grow downward. -->
			<div
				class="grid min-w-0 items-start gap-x-3 gap-y-1"
				style="grid-template-columns: minmax(0, 1fr) auto;"
			>
				<h1
					id="hero-alias"
					class="col-start-1 row-start-1 min-w-0 truncate text-[1.125rem] leading-tight font-semibold tracking-[-0.01em] text-[var(--sl-text-1)]"
				>
					{alias}
				</h1>
				{#key statusPolling.tickCounter}
					<div class="col-start-2 row-start-1 flex flex-wrap items-center justify-end gap-1.5">
						<DeviceStatusBadge badge={connectivityBadge} />
						{#if drivingBadge}
							<DeviceStatusBadge badge={drivingBadge} />
						{/if}
					</div>
				{/key}

				<p
					class="col-start-1 row-start-2 min-w-0 truncate text-[0.75rem] text-[var(--sl-text-3)]"
					title={device.device_id}
				>
					{device.device_id}
				</p>
				<div class="col-start-2 row-start-2 flex flex-wrap items-center justify-end gap-1.5">
					<LegacyDeviceBadge deviceId={device.device_id} variant="chip" />
				</div>
			</div>

			<ChevronRight
				size={16}
				class="mt-1.5 shrink-0 text-[var(--sl-text-3)] transition-transform duration-100 group-hover:translate-x-0.5 group-hover:text-[var(--sl-text-2)]"
				aria-hidden="true"
			/>
		</div>
	</a>

	<div class="border-t border-[var(--sl-border-muted)]"></div>

	<dl class="grid grid-cols-3 gap-2 p-4 sm:p-5" aria-label="Device build info">
		<div class="min-w-0">
			<dt class="text-[0.6875rem] tracking-wider text-[var(--sl-text-3)] uppercase">Version</dt>
			<dd class="mt-1 truncate text-[0.8125rem] font-medium text-[var(--sl-text-1)]">
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
			<dd class="mt-1 min-w-0 text-[0.8125rem] font-medium text-[var(--sl-text-1)]">
				{#if !infoLoaded}
					<span
						class="inline-block h-3 w-20 animate-pulse rounded bg-[var(--sl-bg-elevated)]/80"
						aria-hidden="true"
					></span>
					<span class="sr-only">Loading branch</span>
				{:else if branch}
					<MarqueeText
						text={branch}
						className="text-[0.8125rem] font-medium text-[var(--sl-text-1)]"
					/>
				{:else}
					—
				{/if}
			</dd>
		</div>
		<div class="min-w-0">
			<dt class="text-[0.6875rem] tracking-wider text-[var(--sl-text-3)] uppercase">Commit</dt>
			<dd class="mt-1 truncate text-[0.8125rem] font-medium text-[var(--sl-text-1)]">
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
</section>
