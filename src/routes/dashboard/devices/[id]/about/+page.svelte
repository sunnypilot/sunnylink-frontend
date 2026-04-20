<script lang="ts">
	import { page } from '$app/state';
	import { goto } from '$app/navigation';
	import { deviceState } from '$lib/stores/device.svelte';
	import { statusPolling } from '$lib/stores/statusPolling.svelte';
	import { formatRelativeTime } from '$lib/utils/time';
	import { ChevronLeft, Copy, Check } from 'lucide-svelte';

	let id = $derived(page.params.id);

	const DEVICE_TYPE_NAMES: Record<string, string> = {
		tizi: 'comma 3X',
		mici: 'comma four',
		tici: 'comma three',
		pc: 'PC'
	};

	let device = $derived(
		(deviceState.pairedDevices ?? []).find(
			(d: { device_id?: string | null }) => d.device_id === id
		) ?? null
	);
	let notFound = $derived(deviceState.pairedDevicesLoaded && !device);

	let alias = $derived(
		(id && deviceState.aliases[id]) || device?.alias || id || ''
	);
	let onlineStatus = $derived(id ? deviceState.onlineStatuses[id] : undefined);
	let offroadStatus = $derived(id ? deviceState.offroadStatuses[id] : undefined);
	let telemetry = $derived(id ? deviceState.deviceTelemetry[id] : undefined);
	let values = $derived(id ? deviceState.deviceValues[id] : undefined);

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
	let commit = $derived((values?.['GitCommit'] as string | undefined) ?? null);

	let lastSeen = $derived.by(() => {
		if (!id) return null;
		if (onlineStatus === 'online') return deviceState.lastStatusCheck[id];
		return deviceState.lastSeenOnline[id];
	});

	let drivingState = $derived.by(() => {
		if (onlineStatus !== 'online') return null;
		if (offroadStatus?.forceOffroad) return 'Always Offroad';
		if (offroadStatus?.isOffroad === false) return 'Onroad';
		if (offroadStatus?.isOffroad === true) return 'Offroad';
		return null;
	});

	let statusText = $derived.by(() => {
		if (!onlineStatus || onlineStatus === 'loading') return 'Checking…';
		if (onlineStatus === 'error') return 'Error';
		if (onlineStatus === 'offline') return 'Offline';
		return drivingState ? `Online · ${drivingState}` : 'Online';
	});

	let pairedDate = $derived.by(() => {
		if (!device?.created_at) return null;
		try {
			return new Date(device.created_at).toLocaleDateString(undefined, {
				year: 'numeric',
				month: 'short',
				day: 'numeric'
			});
		} catch {
			return device.created_at;
		}
	});

	let copiedField = $state<string | null>(null);
	async function copyValue(field: string, value: string | null | undefined) {
		if (!value) return;
		try {
			await navigator.clipboard.writeText(value);
			copiedField = field;
			setTimeout(() => {
				if (copiedField === field) copiedField = null;
			}, 2_000);
		} catch {
			/* ignore */
		}
	}
</script>

<div class="mx-auto w-full max-w-2xl px-4 py-6 sm:px-6">
	<button
		type="button"
		onclick={() => goto('/dashboard')}
		class="mb-4 inline-flex items-center gap-1 text-[0.8125rem] font-medium text-[var(--sl-text-2)] transition-colors hover:text-[var(--sl-text-1)]"
	>
		<ChevronLeft size={14} aria-hidden="true" />
		Back to Home
	</button>

	<h1 class="text-[1.5rem] leading-tight font-semibold tracking-[-0.01em] text-[var(--sl-text-1)]">
		About this device
	</h1>
	<p class="mt-1 truncate text-[0.875rem] text-[var(--sl-text-2)]">{alias}</p>

	{#if notFound}
		<div
			class="mt-6 rounded-lg border border-red-500/30 bg-red-500/5 px-4 py-3 text-[0.8125rem] text-red-700 dark:text-red-400"
			role="alert"
		>
			Device not found in paired list.
		</div>
	{/if}

	<dl class="mt-6 divide-y divide-[var(--sl-border)] rounded-xl border border-[var(--sl-border)] bg-[var(--sl-bg-surface)]">
		{@render row('Status', statusText)}
		{@render row('Device type', deviceTypeName)}
		{@render row('Network', networkType)}
		{@render row('Last seen', lastSeen ? (statusPolling.tickCounter, formatRelativeTime(lastSeen)) : null)}
		{@render row('Paired date', pairedDate)}
		{@render row('Version', version)}
		{@render row('Branch', branch, true)}
		{@render row('Commit', commit, true)}
		{@render copyRow('sunnylink Device ID', id ?? null, 'sunnylink')}
		{@render copyRow('comma dongle ID', device?.comma_dongle_id ?? null, 'dongle')}
	</dl>

	{#if !deviceState.pairedDevicesLoaded && !device}
		<p class="mt-4 text-center text-[0.75rem] text-[var(--sl-text-3)]" aria-live="polite">
			Loading device details…
		</p>
	{/if}
</div>

{#snippet row(label: string, value: string | null, mono = false)}
	<div class="flex items-center justify-between gap-4 px-4 py-3">
		<dt class="text-[0.8125rem] text-[var(--sl-text-3)]">{label}</dt>
		<dd
			class="truncate text-right text-[0.8125rem] font-medium text-[var(--sl-text-1)] {mono ? 'font-mono' : ''}"
		>
			{value ?? '—'}
		</dd>
	</div>
{/snippet}

{#snippet copyRow(label: string, value: string | null, field: string)}
	<div class="flex items-center justify-between gap-4 px-4 py-3">
		<dt class="text-[0.8125rem] text-[var(--sl-text-3)]">{label}</dt>
		<dd class="flex min-w-0 items-center gap-2">
			<span class="truncate font-mono text-[0.8125rem] text-[var(--sl-text-1)]">
				{value ?? '—'}
			</span>
			{#if value}
				<button
					type="button"
					onclick={() => copyValue(field, value)}
					class="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-[var(--sl-text-3)] transition-colors hover:bg-[var(--sl-bg-elevated)] hover:text-[var(--sl-text-1)] focus-visible:outline-2 focus-visible:outline-primary"
					aria-label="Copy {label}"
				>
					{#if copiedField === field}
						<Check size={12} class="text-emerald-600 dark:text-emerald-400" aria-hidden="true" />
					{:else}
						<Copy size={12} aria-hidden="true" />
					{/if}
				</button>
			{/if}
		</dd>
	</div>
{/snippet}
