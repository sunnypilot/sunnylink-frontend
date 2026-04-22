<script lang="ts">
	import { goto } from '$app/navigation';
	import { authState, logtoClient } from '$lib/logto/auth.svelte';
	import { deviceState } from '$lib/stores/device.svelte';
	import { checkDeviceStatus } from '$lib/api/device';
	import MyDevicesSkeleton from './MyDevicesSkeleton.svelte';
	import RefreshIndicator from '$lib/components/RefreshIndicator.svelte';
	import { formatRelativeTime } from '$lib/utils/time';
	import { statusPolling } from '$lib/stores/statusPolling.svelte';
	import { Plus, ChevronDown, Check, ArrowRight } from 'lucide-svelte';
	import { slide, scale } from 'svelte/transition';
	import { APIv0Client } from '$lib/api/client';
	import MarqueeText from '$lib/components/MarqueeText.svelte';
	import LegacyDeviceBadge from '$lib/components/LegacyDeviceBadge.svelte';
	import { schemaState } from '$lib/stores/schema.svelte';

	let { data } = $props();

	let offlineSectionOpen = $state(false);

	$effect(() => {
		// Skip the redirect when the session was killed mid-use — the modal in
		// +layout.svelte handles that recovery (Sign in / Maybe later). Without
		// this guard the redirect races the modal and swallows the prompt.
		if (!authState.loading && !authState.isAuthenticated && !authState.sessionExpired) {
			goto('/');
		}
	});

	// Fetch detail + status for every paired device when this page mounts.
	// The root layout only hydrates the selected device to keep the rest of
	// the app cheap; this page is the one place where all devices need rich
	// data (alias, comma_dongle_id, paired date) and live status for the
	// list rendering. Runs once per mount; statusPolling continues polling
	// whatever is in onlineStatuses afterward.
	let allDevicesHydrated = false;
	$effect(() => {
		if (allDevicesHydrated) return;
		if (!deviceState.pairedDevicesLoaded) return;
		if (deviceState.pairedDevices.length === 0) return;
		allDevicesHydrated = true;

		(async () => {
			const token = await logtoClient?.getIdToken();
			if (!token) return;
			const list = deviceState.pairedDevices.slice();
			const detailTasks = list
				.filter((d: any) => d.device_id && !d.alias)
				.map(async (d: any) => {
					const r = await APIv0Client.GET('/device/{deviceId}', {
						params: { path: { deviceId: d.device_id } },
						headers: { Authorization: `Bearer ${token}` }
					});
					const detail = r.data;
					if (detail && detail.device_id) {
						deviceState.pairedDevices = deviceState.pairedDevices.map((x: any) =>
							x.device_id === detail.device_id ? { ...x, ...detail } : x
						);
						if (detail.alias && !deviceState.aliases[detail.device_id]) {
							deviceState.aliases = {
								...deviceState.aliases,
								[detail.device_id]: detail.alias
							};
						}
					}
				});
			const statusTasks = list.map((d: any) => {
				if (d.device_id) return checkDeviceStatus(d.device_id, token);
			});
			await Promise.allSettled([...detailTasks, ...statusTasks]);
			statusPolling.markChecked();
		})();
	});

	function getAlias(device: any) {
		return deviceState.aliases[device.device_id] ?? device.alias ?? device.device_id;
	}

	function getStatusText(device: any): string {
		const status = deviceState.onlineStatuses[device.device_id];
		const offroad = deviceState.offroadStatuses[device.device_id];
		if (!status || status === 'loading') return 'Checking...';
		if (status === 'error') return deviceState.lastErrorMessages[device.device_id] || 'Error';
		if (status === 'offline') return 'Offline';
		const offroadText = offroad?.isOffroad ? 'Offroad' : offroad ? 'Driving' : '';
		return offroadText ? `Online · ${offroadText}` : 'Online';
	}

	function getStatusDotClass(device: any): string {
		const status = deviceState.onlineStatuses[device.device_id];
		if (!status || status === 'loading') return 'bg-[var(--sl-text-3)] animate-pulse';
		if (status === 'error') return 'bg-red-400';
		if (status === 'offline') return 'bg-[var(--sl-text-3)]/50';
		// Online — check offroad state for color
		const offroad = deviceState.offroadStatuses[device.device_id];
		if (offroad?.forceOffroad) return 'bg-amber-400';
		if (offroad?.isOffroad === false) return 'bg-blue-400';
		return 'bg-emerald-400';
	}

	function getCommitDate(device: any): string | null {
		const values = deviceState.deviceValues[device.device_id];
		const raw = values?.['GitCommitDate'] as string | undefined;
		if (!raw) return null;
		const trimmed = raw.replace(/^'|'$/g, '').trim();
		const first = trimmed.split(/\s+/)[0];
		const sec = Number(first);
		if (!Number.isFinite(sec) || sec <= 0) return null;
		return formatRelativeTime(sec * 1000);
	}

	const DEVICE_TYPE_NAMES: Record<string, string> = {
		tizi: 'comma 3X',
		mici: 'comma four',
		tici: 'comma three',
		pc: 'PC'
	};

	function getDeviceTypeName(device: any): string | null {
		const telemetry = deviceState.deviceTelemetry[device.device_id];
		const type = telemetry?.deviceType;
		if (!type || type === 'unknown') return null;
		return DEVICE_TYPE_NAMES[type.toLowerCase()] ?? null;
	}

	function getVersion(device: any): string | null {
		const values = deviceState.deviceValues[device.device_id];
		const ver = values?.['Version'] as string | undefined;
		if (!ver) return null;
		return ver;
	}

	function getCommit(device: any): string | null {
		const values = deviceState.deviceValues[device.device_id];
		const commit = values?.['GitCommit'] as string | undefined;
		if (!commit) return null;
		return commit.slice(0, 8);
	}

	function getBranch(device: any): string | null {
		const values = deviceState.deviceValues[device.device_id];
		const branch = values?.['GitBranch'] as string | undefined;
		if (!branch) return null;
		return branch;
	}

	function selectDevice(device: any) {
		deviceState.setSelectedDevice(device.device_id);
		const isLegacy = schemaState.schemaUnavailable[device.device_id] === true;
		// Legacy devices surface LegacyTopBanner above the list on select. The
		// banner is meaningful device-state info the user must see; default
		// card-center scroll would push the banner above the viewport. Scroll
		// the main scroll container to the top so the banner (and anything
		// above it) is fully visible.
		if (isLegacy) {
			requestAnimationFrame(() => {
				const scroller = document.querySelector('.drawer-content') as HTMLElement | null;
				scroller?.scrollTo({ top: 0, behavior: 'smooth' });
			});
			return;
		}
		// Non-legacy: keep the card centered so the checkmark + Manage CTA stay
		// on screen, even if the user tapped near the bottom edge of the viewport.
		requestAnimationFrame(() => {
			const el = document.querySelector(`[data-device-id="${device.device_id}"]`);
			if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
		});
	}

	async function retryDevice(device: any) {
		const token = await logtoClient?.getIdToken();
		if (!token) return;
		await checkDeviceStatus(device.device_id, token, true);
	}

	function handleCardClick(device: any) {
		const status = deviceState.onlineStatuses[device.device_id];
		if (status === 'error') {
			void retryDevice(device);
			return;
		}
		selectDevice(device);
	}

	function goHome() {
		goto('/dashboard');
	}

	// Use cached devices from deviceState for instant rendering; update when API returns
	let devices = $derived(deviceState.pairedDevices);

	// Keep stable natural sort — no pinning. Selected device indicated by
	// checkmark + "Manage on Home" CTA inline; reshuffling on select causes
	// mental-model churn and spam-click flip-flop (Vercel/Slack/Notion pattern).
	let onlineDevices = $derived.by(() => {
		deviceState.version;
		if (!devices) return [];
		const list = devices.filter((d) => {
			const status = deviceState.onlineStatuses[d.device_id];
			return (
				status === 'online' || status === 'loading' || status === 'error' || status === undefined
			);
		});
		return deviceState.sortDevices(list);
	});

	let offlineDevices = $derived.by(() => {
		deviceState.version;
		if (!devices) return [];
		const list = devices.filter((d) => {
			return deviceState.onlineStatuses[d.device_id] === 'offline';
		});
		return deviceState.sortDevices(list);
	});

	// Mount-time behaviour: if the persisted selection lives in the offline
	// group, expand the group once so the user lands with the selected card
	// visible, then scroll-into-view the selected card (works for online + offline).
	// Runs once per mount — the user can collapse / re-expand freely afterward
	// without fighting us, and selecting a new device doesn't re-trigger this
	// because the flag flips permanently.
	let mountBehaviourRan = false;
	$effect(() => {
		if (mountBehaviourRan) return;
		if (!deviceState.pairedDevicesLoaded) return;
		if (!devices || devices.length === 0) return;
		const sel = deviceState.selectedDeviceId;
		if (!sel) {
			mountBehaviourRan = true;
			return;
		}
		mountBehaviourRan = true;

		const isOffline = deviceState.onlineStatuses[sel] === 'offline';
		if (isOffline) offlineSectionOpen = true;

		// Defer past the offline section's slide transition (~150ms) before
		// querying the DOM — querying inside two rAFs (~32ms) found the card
		// before the slide had finished mounting it. Retry once at 600ms in
		// case the card is rendered behind a still-animating section.
		const findAndScroll = () => {
			const el = document.querySelector(`[data-device-id="${sel}"]`);
			if (el) {
				el.scrollIntoView({ behavior: 'smooth', block: 'center' });
				return true;
			}
			return false;
		};
		setTimeout(() => {
			if (!findAndScroll()) setTimeout(findAndScroll, 350);
		}, 250);
	});
</script>

{#if authState.loading}
	<!-- Auth state still resolving — don't render content and don't let the guard $effect fire prematurely -->
	<MyDevicesSkeleton />
{:else if !authState.isAuthenticated}
	<!-- Guard $effect above handles goto('/'); render nothing while redirect is in flight -->
{:else if devices.length === 0 && !deviceState.pairedDevicesLoaded}
	<!-- Cold start: no cached devices, API hasn't returned yet — show skeleton -->
	<MyDevicesSkeleton />
{:else}
	<div class="mx-auto w-full max-w-2xl xl:max-w-3xl">
		{#if devices.length === 0}
			<!-- API returned but no devices — true empty state -->
			<div class="flex flex-col items-center justify-center py-16 text-center">
				<p class="text-sm text-[var(--sl-text-2)]">No devices connected</p>
				<p class="mt-1 text-xs text-[var(--sl-text-3)]">Pair a sunnypilot device to get started.</p>
				<button
					class="btn mt-6 gap-2 border-[var(--sl-border)] bg-[var(--sl-bg-elevated)] text-[var(--sl-text-1)] transition-all duration-100 btn-sm hover:bg-[var(--sl-bg-subtle)] active:scale-[0.97] active:bg-[var(--sl-bg-elevated)]"
					onclick={() => deviceState.openPairingModal()}
				>
					<Plus size={16} />
					Pair Device
				</button>
			</div>
		{:else}
			<div class="mb-6 flex items-end justify-between gap-3 px-4">
				<div>
					<h1
						class="text-[24px] leading-[32px] font-medium tracking-[-0.16px] text-[var(--sl-text-1)]"
					>
						My Devices
					</h1>
					<p class="mt-1 text-[0.8125rem] text-[var(--sl-text-2)]">
						{devices.length} device{devices.length === 1 ? '' : 's'}
					</p>
				</div>
				<RefreshIndicator />
			</div>

			{#snippet labelValueRow(
				label: string,
				value: string | null,
				mono: boolean,
				loading: boolean,
				marquee: boolean = false
			)}
				<div class="flex items-center justify-between gap-3">
					<span class="shrink-0 text-[0.75rem] text-[var(--sl-text-3)]">{label}</span>
					<div class="min-w-0 flex-1 text-right">
						{#key value}
							{#if value}
								{#if marquee}
									<MarqueeText
										text={value}
										{mono}
										className="value-fade-in text-[0.8125rem] font-medium text-[var(--sl-text-1)]"
									/>
								{:else}
									<span
										class="value-fade-in inline-block max-w-full truncate align-middle text-[0.8125rem] font-medium text-[var(--sl-text-1)] {mono
											? 'font-mono'
											: ''}">{value}</span
									>
								{/if}
							{:else if loading}
								<span class="skeleton-bar w-20" aria-hidden="true"></span>
							{:else}
								<span class="text-[0.8125rem] text-[var(--sl-text-3)]">—</span>
							{/if}
						{/key}
					</div>
				</div>
			{/snippet}

			{#snippet deviceCard(device: any)}
				{@const status = deviceState.onlineStatuses[device.device_id]}
				{@const isLoading = !status || status === 'loading'}
				{@const isOffline = status === 'offline'}
				{@const isError = status === 'error'}
				{@const isSelected = deviceState.selectedDeviceId === device.device_id}
				{@const isPolling = statusPolling.isRefreshing && !isLoading}
				{@const infoLoaded =
					isOffline || isError || deviceState.infoFetchComplete[device.device_id] === true}
				{@const isLegacy = schemaState.schemaUnavailable[device.device_id] === true}
				{@const hasBadges = isLegacy}

				<article
					data-device-id={device.device_id}
					class="group relative cursor-pointer rounded-xl border bg-[var(--sl-bg-surface)] transition-[border-color,background-color,box-shadow] duration-150 hover:bg-[var(--sl-bg-elevated)]/30 hover:shadow-sm {isSelected
						? 'border-2 border-primary'
						: 'border border-[var(--sl-border)] hover:border-[var(--sl-text-3)]/30'}"
					onclick={() => handleCardClick(device)}
					onkeydown={(e) => {
						if (e.key === 'Enter' || e.key === ' ') {
							e.preventDefault();
							handleCardClick(device);
						}
					}}
					role="listitem"
					tabindex="0"
					aria-label="{getAlias(device)} - {isError
						? 'Check failed, tap to retry'
						: isOffline
							? 'Offline'
							: getStatusText(device)}{isSelected ? ' - selected' : ''}"
					aria-busy={isLoading || isPolling ? 'true' : undefined}
				>
					<div class="px-4 py-3.5">
						<!-- Top-right cluster: spinner + checkmark, absolutely positioned so
						     the alias/ID column can use its full width without reserving a
						     trailing icon slot. -->
						{#if isLoading || isPolling || isSelected}
							<div class="absolute top-3.5 right-4 flex items-center gap-2">
								{#if isLoading || isPolling}
									<span
										class="loading loading-xs loading-spinner text-primary"
										aria-label={isLoading ? 'Checking status' : 'Refreshing'}
									></span>
								{/if}
								{#if isSelected}
									<span
										in:scale={{ duration: 150, start: 0.5 }}
										class="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary text-white"
										aria-label="Selected device"
										title="Selected device"
									>
										<Check size={12} aria-hidden="true" />
									</span>
								{/if}
							</div>
						{/if}

						<!-- Header row: status dot vertically centered between alias + sunnylink Device ID. -->
						<div class="flex items-center gap-3 pr-12">
							<span
								class="block h-2.5 w-2.5 shrink-0 rounded-full {getStatusDotClass(
									device
								)} {isPolling ? 'animate-pulse' : ''}"
								aria-hidden="true"
							></span>
							<div class="min-w-0 flex-1">
								<div class="truncate text-sm font-medium text-[var(--sl-text-1)]">
									{getAlias(device)}
								</div>
								<div class="font-mono text-[0.7rem] break-all text-[var(--sl-text-3)]">
									{device.device_id}
								</div>
							</div>
						</div>

						{#if hasBadges}
							<!-- Indented to start under the alias text (dot 10px + gap-3 12px = 22px),
							     so badges read as a continuation of the device's identity column. -->
							<div class="mt-2 flex flex-wrap gap-1.5 pl-[22px]">
								<LegacyDeviceBadge deviceId={device.device_id} variant="chip" />
							</div>
						{/if}

						<div class="mt-3 space-y-1.5 rounded-lg bg-[var(--sl-bg-elevated)]/50 px-3 py-2.5">
							{@render labelValueRow('Device', getDeviceTypeName(device), false, !infoLoaded)}
							{@render labelValueRow('Version', getVersion(device), false, !infoLoaded)}
							{#key statusPolling.tickCounter}
								{@render labelValueRow('Date', getCommitDate(device), false, !infoLoaded)}
							{/key}
							{@render labelValueRow('Branch', getBranch(device), true, !infoLoaded, true)}
							{@render labelValueRow('Commit', getCommit(device), true, !infoLoaded)}
						</div>

						{#if isSelected}
							<button
								type="button"
								class="mt-3 flex w-full items-center justify-between rounded-lg border border-primary/30 bg-primary/10 px-4 py-2.5 text-[0.8125rem] font-medium text-primary transition-all duration-100 hover:bg-primary/15 focus-visible:outline-2 focus-visible:outline-primary active:scale-[0.99] active:bg-primary/25"
								in:slide={{ duration: 180 }}
								onclick={(e) => {
									e.stopPropagation();
									goHome();
								}}
								aria-label="Manage this device on Home"
							>
								<span>Manage on Home</span>
								<ArrowRight size={14} aria-hidden="true" />
							</button>
						{/if}
					</div>
				</article>
			{/snippet}

			<div class="flex flex-col gap-3" role="list" aria-label="Device list">
				{#each onlineDevices as device (device.device_id)}
					{@render deviceCard(device)}
				{/each}

				{#if offlineDevices.length > 0}
					<button
						class="group flex w-full items-center justify-between rounded-lg border border-[var(--sl-border)] bg-[var(--sl-bg-surface)] px-4 py-3 text-left transition-all duration-100 hover:border-[var(--sl-text-3)]/40 hover:bg-[var(--sl-bg-elevated)] focus-visible:border-primary focus-visible:outline-none active:scale-[0.99] active:bg-[var(--sl-bg-subtle)]"
						onclick={() => (offlineSectionOpen = !offlineSectionOpen)}
						aria-expanded={offlineSectionOpen}
						aria-controls="offline-devices-section"
					>
						<div class="flex items-center gap-2">
							<ChevronDown
								size={16}
								class="shrink-0 text-[var(--sl-text-2)] transition-transform duration-200 {offlineSectionOpen
									? ''
									: '-rotate-90'}"
								aria-hidden="true"
							/>
							<span class="text-sm font-medium text-[var(--sl-text-1)]">Offline</span>
							<span
								class="rounded-full bg-[var(--sl-bg-elevated)] px-2 py-0.5 text-[0.6875rem] font-semibold text-[var(--sl-text-2)] group-hover:bg-[var(--sl-bg-subtle)]"
							>
								{offlineDevices.length}
							</span>
						</div>
					</button>

					{#if offlineSectionOpen}
						<div
							id="offline-devices-section"
							class="flex flex-col gap-3"
							transition:slide={{ duration: 150 }}
						>
							{#each offlineDevices as device (device.device_id)}
								{@render deviceCard(device)}
							{/each}
						</div>
					{/if}
				{/if}
			</div>

			<button
				class="group mt-4 flex w-full items-center gap-4 rounded-xl border border-dashed border-[var(--sl-border)] px-4 py-3.5 text-left transition-all duration-100 hover:border-[var(--sl-text-3)]/50 hover:bg-[var(--sl-bg-surface)]/50 active:scale-[0.99] active:bg-[var(--sl-bg-elevated)]"
				onclick={() => deviceState.openPairingModal()}
			>
				<div
					class="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-dashed border-[var(--sl-text-3)]/50 text-[var(--sl-text-3)] transition-colors group-hover:border-[var(--sl-text-2)] group-hover:text-[var(--sl-text-2)]"
				>
					<Plus size={16} />
				</div>
				<p
					class="text-sm text-[var(--sl-text-3)] transition-colors group-hover:text-[var(--sl-text-2)]"
				>
					Pair New Device
				</p>
			</button>
		{/if}
	</div>
{/if}
