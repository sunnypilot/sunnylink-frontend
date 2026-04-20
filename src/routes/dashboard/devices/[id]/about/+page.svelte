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

	let alias = $derived((id && deviceState.aliases[id]) || device?.alias || id || '');
	let onlineStatus = $derived(id ? deviceState.onlineStatuses[id] : undefined);
	let offroadStatus = $derived(id ? deviceState.offroadStatuses[id] : undefined);
	let telemetry = $derived(id ? deviceState.deviceTelemetry[id] : undefined);
	let values = $derived(id ? deviceState.deviceValues[id] : undefined);

	// Loaded flags — used to render skeleton placeholders while a fetch is in
	// flight, falling back to "—" only after the fetch completes (success or
	// failure) so we never claim a value is missing while it's still arriving.
	let statusLoaded = $derived(
		!!onlineStatus && onlineStatus !== 'loading' && (!!telemetry || onlineStatus !== 'online')
	);
	let infoLoaded = $derived(!!id && deviceState.infoFetchComplete[id] === true);

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
	let commitShort = $derived(commit ? commit.slice(0, 7) : null);

	// GitCommitDate format from device's get_commit_date():
	//   "'1708012345 2024-02-15 10:32:25 +0000'" (quoted unix seconds + ISO).
	// Parse the leading unix timestamp and surface as a relative "X ago" label.
	let commitDateMs = $derived.by(() => {
		const raw = values?.['GitCommitDate'] as string | undefined;
		if (!raw) return null;
		const trimmed = raw.replace(/^'|'$/g, '').trim();
		const first = trimmed.split(/\s+/)[0];
		const sec = Number(first);
		if (!Number.isFinite(sec) || sec <= 0) return null;
		return sec * 1000;
	});
	let commitDateLabel = $derived(
		commitDateMs ? (statusPolling.tickCounter, formatRelativeTime(commitDateMs)) : null
	);

	let lastSeen = $derived.by(() => {
		if (!id) return null;
		if (onlineStatus === 'online') return deviceState.lastStatusCheck[id];
		return deviceState.lastSeenOnline[id];
	});

	type BadgeTone = 'green' | 'red' | 'amber' | 'cyan' | 'gray';
	type Badge = { label: string; tone: BadgeTone };

	let connectivityBadge = $derived.by<Badge>(() => {
		if (!onlineStatus || onlineStatus === 'loading') return { label: 'Checking…', tone: 'gray' };
		if (onlineStatus === 'error') return { label: 'Error', tone: 'red' };
		if (onlineStatus === 'offline') return { label: 'Offline', tone: 'red' };
		return { label: 'Online', tone: 'green' };
	});

	let drivingBadge = $derived.by<Badge | null>(() => {
		if (onlineStatus !== 'online') return null;
		if (offroadStatus?.forceOffroad) return { label: 'Always Offroad', tone: 'amber' };
		if (offroadStatus?.isOffroad === false) return { label: 'Onroad', tone: 'cyan' };
		if (offroadStatus?.isOffroad === true) return { label: 'Offroad', tone: 'gray' };
		return null;
	});

	// Inline-pill colors. Each tone targets WCAG AA (4.5:1) on the tinted bg
	// in both light and dark modes; ring adds a subtle border for low-luminance
	// fills so the boundary remains visible against the surface card.
	const TONE_CLASSES: Record<BadgeTone, string> = {
		green:
			'bg-emerald-500/10 text-emerald-700 ring-1 ring-inset ring-emerald-500/30 dark:text-emerald-400',
		red: 'bg-red-500/10 text-red-700 ring-1 ring-inset ring-red-500/30 dark:text-red-400',
		amber: 'bg-amber-500/10 text-amber-700 ring-1 ring-inset ring-amber-500/30 dark:text-amber-400',
		cyan: 'bg-cyan-500/10 text-cyan-700 ring-1 ring-inset ring-cyan-500/30 dark:text-cyan-400',
		gray: 'bg-[var(--sl-bg-elevated)] text-[var(--sl-text-2)] ring-1 ring-inset ring-[var(--sl-border)]'
	};

	let pairedDate = $derived.by(() => {
		if (!device?.created_at) return null;
		// API exposes created_at as int64 unix seconds. Multiply to ms before
		// handing to Date — passing seconds directly returns 1970.
		const ms = typeof device.created_at === 'number' ? device.created_at * 1000 : device.created_at;
		try {
			return new Date(ms).toLocaleDateString(undefined, {
				year: 'numeric',
				month: 'short',
				day: 'numeric'
			});
		} catch {
			return String(device.created_at);
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

	<dl
		class="mt-6 divide-y divide-[var(--sl-border)] rounded-xl border border-[var(--sl-border)] bg-[var(--sl-bg-surface)]"
	>
		{@render statusRow()}
		{@render row('Device type', deviceTypeName, false, statusLoaded)}
		{@render row('Network', networkType, false, statusLoaded)}
		{@render row(
			'Last seen',
			lastSeen ? (statusPolling.tickCounter, formatRelativeTime(lastSeen)) : null,
			false,
			statusLoaded
		)}
		{@render row('Paired date', pairedDate)}
		{@render row('Version', version, false, infoLoaded)}
		{@render row('Date', commitDateLabel, false, infoLoaded)}
		{@render scrollRow('Branch', branch, infoLoaded)}
		{@render commitRow()}
		{@render copyRow('sunnylink Device ID', id ?? null, 'sunnylink')}
		{@render copyRow('comma Dongle ID', device?.comma_dongle_id ?? null, 'dongle')}
	</dl>

	{#if !deviceState.pairedDevicesLoaded && !device}
		<p class="mt-4 text-center text-[0.75rem] text-[var(--sl-text-3)]" aria-live="polite">
			Loading device details…
		</p>
	{/if}
</div>

{#snippet row(label: string, value: string | null, mono = false, loaded = true)}
	<div class="flex items-center justify-between gap-4 px-4 py-3">
		<dt class="text-[0.8125rem] text-[var(--sl-text-3)]">{label}</dt>
		<dd
			class="truncate text-right text-[0.8125rem] font-medium text-[var(--sl-text-1)] {mono
				? 'font-mono'
				: ''}"
		>
			{#if !loaded}
				<span
					class="inline-block h-3 w-20 animate-pulse rounded bg-[var(--sl-bg-elevated)]"
					aria-hidden="true"
				></span>
				<span class="sr-only">Loading {label}</span>
			{:else}
				{value ?? '—'}
			{/if}
		</dd>
	</div>
{/snippet}

{#snippet badgePill(badge: Badge)}
	<span
		class="inline-flex items-center rounded-full px-2 py-0.5 text-[0.6875rem] font-medium whitespace-nowrap {TONE_CLASSES[
			badge.tone
		]}"
	>
		{badge.label}
	</span>
{/snippet}

{#snippet statusRow()}
	<div class="flex items-center justify-between gap-4 px-4 py-3">
		<dt class="text-[0.8125rem] text-[var(--sl-text-3)]">Status</dt>
		<dd class="flex flex-wrap items-center justify-end gap-1.5">
			{@render badgePill(connectivityBadge)}
			{#if drivingBadge}
				{@render badgePill(drivingBadge)}
			{/if}
		</dd>
	</div>
{/snippet}

{#snippet scrollRow(label: string, value: string | null, loaded = true)}
	<div class="flex items-center justify-between gap-4 px-4 py-3">
		<dt class="shrink-0 text-[0.8125rem] text-[var(--sl-text-3)]">{label}</dt>
		<dd class="min-w-0 flex-1 overflow-x-auto text-right whitespace-nowrap">
			{#if !loaded}
				<span
					class="inline-block h-3 w-32 animate-pulse rounded bg-[var(--sl-bg-elevated)]"
					aria-hidden="true"
				></span>
				<span class="sr-only">Loading {label}</span>
			{:else}
				<span class="font-mono text-[0.8125rem] font-medium text-[var(--sl-text-1)]">
					{value ?? '—'}
				</span>
			{/if}
		</dd>
	</div>
{/snippet}

{#snippet commitRow()}
	<div class="flex items-center justify-between gap-4 px-4 py-3">
		<dt class="shrink-0 text-[0.8125rem] text-[var(--sl-text-3)]">Commit</dt>
		<dd class="flex min-w-0 flex-1 items-center justify-end gap-2">
			{#if !infoLoaded}
				<span
					class="inline-block h-3 w-16 animate-pulse rounded bg-[var(--sl-bg-elevated)]"
					aria-hidden="true"
				></span>
				<span class="sr-only">Loading commit hash</span>
			{:else}
				<span
					class="overflow-x-auto font-mono text-[0.8125rem] font-medium whitespace-nowrap text-[var(--sl-text-1)]"
					title={commit ?? ''}
				>
					{commitShort ?? '—'}
				</span>
			{/if}
			{#if commit}
				<button
					type="button"
					onclick={() => copyValue('commit', commit)}
					class="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-[var(--sl-text-3)] transition-colors hover:bg-[var(--sl-bg-elevated)] hover:text-[var(--sl-text-1)] focus-visible:outline-2 focus-visible:outline-primary"
					aria-label="Copy commit hash"
				>
					{#if copiedField === 'commit'}
						<Check size={12} class="text-emerald-600 dark:text-emerald-400" aria-hidden="true" />
					{:else}
						<Copy size={12} aria-hidden="true" />
					{/if}
				</button>
			{/if}
		</dd>
	</div>
{/snippet}

{#snippet copyRow(label: string, value: string | null, field: string)}
	<div class="flex items-center justify-between gap-4 px-4 py-3">
		<dt class="shrink-0 text-[0.8125rem] text-[var(--sl-text-3)]">{label}</dt>
		<dd class="flex min-w-0 flex-1 items-center justify-end gap-2">
			<span
				class="overflow-x-auto font-mono text-[0.8125rem] whitespace-nowrap text-[var(--sl-text-1)]"
			>
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
