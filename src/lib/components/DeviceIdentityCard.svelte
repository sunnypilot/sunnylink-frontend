<script lang="ts">
	import { deviceState } from '$lib/stores/device.svelte';
	import { statusPolling } from '$lib/stores/statusPolling.svelte';
	import { formatRelativeTime } from '$lib/utils/time';
	import { Copy, Check, Monitor, ArrowRight } from 'lucide-svelte';

	interface Props {
		deviceId: string;
	}

	let { deviceId }: Props = $props();

	const DEVICE_TYPE_NAMES: Record<string, string> = {
		tizi: 'comma 3X',
		mici: 'comma four',
		tici: 'comma three',
		pc: 'PC'
	};

	let alias = $derived(
		deviceState.aliases[deviceId] ?? deviceId
	);
	let onlineStatus = $derived(deviceState.onlineStatuses[deviceId]);
	let offroadStatus = $derived(deviceState.offroadStatuses[deviceId]);
	let telemetry = $derived(deviceState.deviceTelemetry[deviceId]);
	let values = $derived(deviceState.deviceValues[deviceId]);

	let deviceTypeName = $derived.by(() => {
		const t = telemetry?.deviceType;
		if (!t || t === 'unknown') return null;
		return DEVICE_TYPE_NAMES[t.toLowerCase()] ?? null;
	});

	let networkType = $derived.by(() => {
		const t = telemetry?.networkType;
		if (!t || t === 'unknown') return null;
		const map: Record<string, string> = {
			wifi: 'WiFi',
			cellular: 'Cellular',
			ethernet: 'Ethernet'
		};
		return map[t.toLowerCase()] ?? t;
	});

	let version = $derived((values?.['Version'] as string | undefined) ?? null);
	let branch = $derived((values?.['GitBranch'] as string | undefined) ?? null);
	let commit = $derived.by(() => {
		const c = values?.['GitCommit'] as string | undefined;
		return c ? c.slice(0, 8) : null;
	});

	let lastSeen = $derived.by(() => {
		if (onlineStatus === 'online') return deviceState.lastStatusCheck[deviceId];
		return deviceState.lastSeenOnline[deviceId];
	});

	let drivingState = $derived.by(() => {
		if (onlineStatus !== 'online') return null;
		if (offroadStatus?.forceOffroad) return 'Always Offroad';
		if (offroadStatus?.isOffroad === false) return 'Onroad';
		if (offroadStatus?.isOffroad === true) return 'Offroad';
		return null;
	});

	let statusText = $derived.by(() => {
		if (!onlineStatus || onlineStatus === 'loading') return 'Checking...';
		if (onlineStatus === 'error')
			return deviceState.lastErrorMessages[deviceId] ?? 'Error';
		if (onlineStatus === 'offline') return 'Offline';
		return drivingState ? `Online · ${drivingState}` : 'Online';
	});

	let statusDot = $derived.by(() => {
		if (!onlineStatus || onlineStatus === 'loading')
			return 'bg-[var(--sl-text-3)] animate-pulse';
		if (onlineStatus === 'error') return 'bg-red-400';
		if (onlineStatus === 'offline') return 'bg-[var(--sl-text-3)]/50';
		if (offroadStatus?.forceOffroad) return 'bg-amber-400';
		if (offroadStatus?.isOffroad === false) return 'bg-blue-400';
		return 'bg-emerald-400';
	});

	let stripColor = $derived.by(() => {
		if (!onlineStatus || onlineStatus === 'loading')
			return 'border-l-[var(--sl-text-3)]/40';
		if (onlineStatus === 'error') return 'border-l-red-400';
		if (onlineStatus === 'offline') return 'border-l-[var(--sl-text-3)]/20';
		if (offroadStatus?.forceOffroad) return 'border-l-amber-400';
		if (offroadStatus?.isOffroad === false) return 'border-l-blue-400';
		return 'border-l-emerald-400';
	});

	let copied = $state(false);
	async function copyDeviceId() {
		try {
			await navigator.clipboard.writeText(deviceId);
			copied = true;
			setTimeout(() => (copied = false), 2000);
		} catch {
			/* ignore */
		}
	}

	/** True while we have no confirmed status from the backend — used to distinguish
	 *  "still fetching" (show skeleton) from "fetched and empty" (show "—"). */
	let isLoading = $derived(!onlineStatus || onlineStatus === 'loading');
</script>

<section
	class="mb-4 overflow-hidden rounded-xl border border-y border-r border-l-[3px] border-y-[var(--sl-border)] border-r-[var(--sl-border)] bg-[var(--sl-bg-surface)] {stripColor}"
	aria-label="Device identity"
	aria-busy={isLoading ? 'true' : undefined}
>
	<div class="flex items-start gap-3 px-4 py-3">
		<div class="min-w-0 flex-1">
			<div class="flex items-center gap-2">
				<span class="block h-2 w-2 shrink-0 rounded-full {statusDot}"></span>
				<h2 class="truncate text-[0.9375rem] font-semibold text-[var(--sl-text-1)]">
					{alias}
				</h2>
				{#if deviceTypeName}
					<span class="flex items-center gap-1 text-[0.75rem] text-[var(--sl-text-3)]">
						<Monitor size={11} class="shrink-0" />
						{deviceTypeName}
					</span>
				{/if}
				<div class="ml-auto shrink-0">
					<a
						href="/dashboard/devices"
						class="flex items-center gap-1 rounded-md px-2 py-1 text-[0.75rem] text-[var(--sl-text-2)] transition-colors hover:bg-[var(--sl-bg-elevated)] hover:text-[var(--sl-text-1)] focus-visible:bg-[var(--sl-bg-elevated)] focus-visible:outline-none"
						aria-label="Change selected device"
					>
						<span>Change device</span>
						<ArrowRight size={12} class="shrink-0" />
					</a>
				</div>
			</div>

			<div class="mt-2.5 grid grid-cols-1 gap-x-6 gap-y-1.5 sm:grid-cols-2">
				{@render row('Status', statusText, false, isLoading)}
				{@render row('Version', version, false, isLoading)}
				{@render row('Branch', branch, true, isLoading)}
				{@render row('Commit', commit, true, isLoading)}
				{@render row('Network', networkType, false, isLoading)}
				<div class="flex items-center gap-3">
					<span class="w-16 shrink-0 text-[0.75rem] text-[var(--sl-text-3)]">Last seen</span>
					{#key statusPolling.tickCounter}
						{#if lastSeen}
							<span class="value-fade-in text-[0.75rem] text-[var(--sl-text-2)]"
								>{formatRelativeTime(lastSeen)}</span
							>
						{:else if isLoading}
							<span class="skeleton-bar w-24" aria-hidden="true"></span>
						{:else}
							<span class="text-[0.75rem] text-[var(--sl-text-3)]">—</span>
						{/if}
					{/key}
				</div>
				<div class="flex items-center gap-3 sm:col-span-2">
					<span class="w-16 shrink-0 text-[0.75rem] text-[var(--sl-text-3)]">Device ID</span>
					<button
						onclick={copyDeviceId}
						class="group flex min-h-[28px] flex-1 items-center justify-between gap-2 rounded-md px-1 py-0.5 transition-colors hover:bg-[var(--sl-bg-elevated)] focus-visible:bg-[var(--sl-bg-elevated)] focus-visible:outline-none"
						aria-label="Copy device ID {deviceId}"
					>
						<span class="truncate font-mono text-[0.75rem] text-[var(--sl-text-2)]"
							>{deviceId}</span
						>
						{#if copied}
							<span
								class="flex shrink-0 items-center gap-1 text-[0.6875rem] text-emerald-600 dark:text-emerald-400"
							>
								<Check size={11} class="shrink-0" />
								Copied
							</span>
						{:else}
							<Copy
								size={11}
								class="shrink-0 text-[var(--sl-text-3)] opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100"
							/>
						{/if}
					</button>
				</div>
			</div>
		</div>
	</div>
</section>

{#snippet row(label: string, value: string | null, mono: boolean, loading: boolean)}
	<div class="flex items-center gap-3">
		<span class="w-16 shrink-0 text-[0.75rem] text-[var(--sl-text-3)]">{label}</span>
		{#key value}
			{#if value}
				<span
					class="value-fade-in truncate text-[0.75rem] text-[var(--sl-text-2)] {mono
						? 'font-mono'
						: ''}">{value}</span
				>
			{:else if loading}
				<span class="skeleton-bar w-24" aria-hidden="true"></span>
			{:else}
				<span class="text-[0.75rem] text-[var(--sl-text-3)]">—</span>
			{/if}
		{/key}
	</div>
{/snippet}
