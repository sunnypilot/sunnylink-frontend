<script lang="ts">
	import { goto } from '$app/navigation';
	import { authState, logtoClient } from '$lib/logto/auth.svelte';
	import { deviceState } from '$lib/stores/device.svelte';
	import { checkDeviceStatus } from '$lib/api/device';
	import MyDevicesSkeleton from './MyDevicesSkeleton.svelte';
	import RefreshIndicator from '$lib/components/RefreshIndicator.svelte';
	import { statusPolling } from '$lib/stores/statusPolling.svelte';
	import { Plus, Check } from 'lucide-svelte';
	import { scale } from 'svelte/transition';
	import { APIv0Client } from '$lib/api/client';
	import LegacyDeviceBadge from '$lib/components/LegacyDeviceBadge.svelte';
	import { schemaState } from '$lib/stores/schema.svelte';
	import { getDeviceDisplayName } from '$lib/utils/deviceDisplay';

	let { data } = $props();

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
		return getDeviceDisplayName(device.device_id, device.alias);
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
		deviceState.setSelectedDevice(device.device_id);
		setTimeout(() => goto('/dashboard'), 80);
	}

	// Use cached devices from deviceState for instant rendering; update when API returns
	let devices = $derived(deviceState.pairedDevices);

	// Single stable list — no online/offline split. Status updates the dot in
	// place; devices never move between groups. Eliminates all list jumping on
	// status resolution. Named devices sort before unnamed, then alphabetical.
	let sortedDevices = $derived.by(() => {
		deviceState.version;
		if (!devices) return [];
		return deviceState.sortDevices(devices.slice());
	});

	// Scroll the selected card into view on mount.
	let mountScrollRan = false;
	$effect(() => {
		if (mountScrollRan) return;
		if (!deviceState.pairedDevicesLoaded) return;
		if (!devices || devices.length === 0) return;
		const sel = deviceState.selectedDeviceId;
		if (!sel) {
			mountScrollRan = true;
			return;
		}
		mountScrollRan = true;

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
		}, 150);
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

			{#snippet deviceCard(device: any)}
				{@const status = deviceState.onlineStatuses[device.device_id]}
				{@const isLoading = !status || status === 'loading'}
				{@const isOffline = status === 'offline'}
				{@const isError = status === 'error'}
				{@const isSelected = deviceState.selectedDeviceId === device.device_id}
				{@const isPolling = statusPolling.isRefreshing && !isLoading}
				{@const isLegacy = schemaState.schemaUnavailable[device.device_id] === true}

				<div
					data-device-id={device.device_id}
					class="group cursor-pointer rounded-xl border bg-[var(--sl-bg-surface)] transition-[border-color,background-color,box-shadow,transform] duration-150 hover:bg-[var(--sl-bg-elevated)]/30 hover:shadow-sm active:scale-[0.98] {isSelected
						? 'border-primary ring-2 ring-primary/40'
						: 'border-[var(--sl-border)] hover:border-[var(--sl-text-3)]/30'}"
					onclick={() => handleCardClick(device)}
					onkeydown={(e) => {
						if (e.key === 'Enter' || e.key === ' ') {
							e.preventDefault();
							handleCardClick(device);
						}
					}}
					role="button"
					tabindex="0"
					aria-label="{getAlias(device)} — {isError
						? 'Check failed, tap to retry'
						: isOffline
							? 'Offline'
							: getStatusText(device)}{isSelected ? ', selected' : ''}"
					aria-busy={isLoading || isPolling ? 'true' : undefined}
				>
					<div class="flex items-center gap-3 px-4 py-3.5">
						<span
							class="block h-2.5 w-2.5 shrink-0 rounded-full {getStatusDotClass(
								device
							)} {isPolling ? 'animate-pulse' : ''}"
							aria-hidden="true"
						></span>
						<div class="min-w-0 flex-1">
							<div
								class="truncate text-sm font-medium leading-5 {isOffline
									? 'text-[var(--sl-text-2)]'
									: 'text-[var(--sl-text-1)]'}"
							>
								{getAlias(device)}
							</div>
							<div class="truncate text-[0.7rem] leading-4 text-[var(--sl-text-3)]">
								{device.device_id}
							</div>
						</div>
						{#if isLoading || isPolling || isSelected}
							<div class="flex shrink-0 items-center gap-2">
								{#if isLoading || isPolling}
									<span
										class="loading loading-spinner text-primary"
										style="width:14px;height:14px"
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
					</div>
					{#if isLegacy}
						<div class="px-4 pb-3 pl-[calc(1rem+10px+0.75rem)]">
							<LegacyDeviceBadge deviceId={device.device_id} variant="chip" />
						</div>
					{/if}
				</div>
			{/snippet}

			<div class="flex flex-col gap-3" role="list" aria-label="Device list">
				{#each sortedDevices as device (device.device_id)}
					{@render deviceCard(device)}
				{/each}
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
