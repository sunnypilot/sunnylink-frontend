<script lang="ts">
	import { browser } from '$app/environment';
	import { goto } from '$app/navigation';
	import { toast } from 'svelte-sonner';
	import { authState, logtoClient } from '$lib/logto/auth.svelte';
	import { deviceState } from '$lib/stores/device.svelte';
	import { AlertTriangle } from 'lucide-svelte';
	import DashboardSkeleton from './DashboardSkeleton.svelte';
	import DashboardHero from '$lib/components/dashboard/DashboardHero.svelte';
	import DashboardTiles from '$lib/components/dashboard/DashboardTiles.svelte';
	import DashboardEmptyState from '$lib/components/dashboard/DashboardEmptyState.svelte';
	import BackupProgressModal from '$lib/components/BackupProgressModal.svelte';
	import { startBackup, retryFailedBackup } from '$lib/utils/backup';
	import { formatRelativeTime } from '$lib/utils/time';
	import { statusPolling } from '$lib/stores/statusPolling.svelte';

	let devices = $derived(deviceState.pairedDevices);

	let selectedDevice = $derived(
		devices.find((d: any) => d.device_id === deviceState.selectedDeviceId) ?? null
	);

	$effect(() => {
		// Skip the redirect when the session was killed mid-use — the modal in
		// +layout.svelte handles that recovery (Sign in / Maybe later). Without
		// this guard the redirect races the modal: modal flashes for a frame,
		// pathname changes to '/', isAuthRequiredRoute flips false → modal
		// hides, user lands on landing without ever seeing the prompt.
		if (!authState.loading && !authState.isAuthenticated && !authState.sessionExpired) {
			goto('/');
		}
	});

	// Fresh sign-in routing: when the user just completed OAuth (flag set by
	// /auth/callback), check the resolved selected device's online status. If
	// it's offline (or there's no usable selection), route to /dashboard/devices
	// so the user can pick a live device instead of landing on a dead one.
	// We hold the dashboard skeleton until this resolves to avoid a "flash of
	// offline device" before the redirect.
	// Consume the flag on read so a page refresh after sign-in doesn't re-trigger
	// the redirect (which would override navigation the user just made manually).
	let justSignedIn = $state(
		browser &&
			(() => {
				const v = sessionStorage.getItem('justSignedIn') === '1';
				if (v) {
					try {
						sessionStorage.removeItem('justSignedIn');
					} catch {
						// ignore
					}
				}
				return v;
			})()
	);
	let signInRouteResolved = $state(false);

	function clearJustSignedIn() {
		signInRouteResolved = true;
		justSignedIn = false;
	}

	$effect(() => {
		if (!justSignedIn || signInRouteResolved) return;
		if (!deviceState.pairedDevicesLoaded) return;

		// No devices paired — let the empty state render on Home, no routing needed.
		if (devices.length === 0) {
			clearJustSignedIn();
			return;
		}

		const sel = deviceState.selectedDeviceId;
		// autoSelect should have committed a selection by now if devices exist;
		// if not, route to picker rather than gambling on a default.
		if (!sel) {
			clearJustSignedIn();
			toast.message('Pick a device to continue', { duration: 3_000 });
			goto('/dashboard/devices');
			return;
		}

		// Wait for the selected device's status check to resolve. statusPolling
		// kicks off in /+layout.svelte after deviceResult resolves, so this fills
		// in within a few seconds.
		const status = deviceState.onlineStatuses[sel];
		if (!status || status === 'loading') return;

		if (status === 'offline') {
			const alias =
				deviceState.aliases[sel] ?? devices.find((d: any) => d.device_id === sel)?.alias ?? sel;
			toast.message(`${alias} is offline — pick another device`, { duration: 4_000 });
			clearJustSignedIn();
			goto('/dashboard/devices');
			return;
		}

		// online or error: stay on Home and render normally.
		clearJustSignedIn();
	});

	let waitingForSignInRoute = $derived(justSignedIn && !signInRouteResolved);

	let isOffline = $derived(
		selectedDevice ? deviceState.onlineStatuses[selectedDevice.device_id] === 'offline' : false
	);

	let offlineSinceTs = $derived.by(() => {
		if (!selectedDevice || !isOffline) return null;
		return deviceState.lastSeenOnline[selectedDevice.device_id] ?? null;
	});

	let offlineSince = $derived(offlineSinceTs ? formatRelativeTime(offlineSinceTs) : null);

	// Duration-tiered subtitle — pattern from Ring / Nest / Find My.
	// <30m: parking-is-likely; 30m-24h: neutral; >24h: warn-ish; >7d: pairing hint.
	let offlineSubtitle = $derived.by(() => {
		if (!offlineSinceTs) {
			return 'Settings you change here will sync when the device reconnects.';
		}
		const hoursAgo = (Date.now() - offlineSinceTs * 1000) / 3_600_000;
		if (hoursAgo < 0.5) {
			return 'Likely parked. Settings you change here will sync when it reconnects.';
		}
		if (hoursAgo < 24) {
			return 'Settings you change here will sync when the device reconnects.';
		}
		if (hoursAgo < 24 * 7) {
			return `Not seen in ${Math.round(hoursAgo / 24)} day(s). Changes will still queue.`;
		}
		return 'Not seen in over a week. Make sure the device is still paired.';
	});

	async function handleRefreshStatus() {
		if (!selectedDevice) return;
		// Master invalidation signal — keeps every page in lock-step with the
		// header refresh: settings/models/osm re-fetch on next reactive pass.
		deviceState.invalidateAll(selectedDevice.device_id);
		const token = await logtoClient?.getIdToken();
		if (!token) return;
		const { checkDeviceStatus } = await import('$lib/api/device');
		await checkDeviceStatus(selectedDevice.device_id, token, true);
	}

	function handleDownloadBackup(deviceId: string, fullRefresh: boolean = false) {
		void startBackup(deviceId, fullRefresh);
	}
</script>

{#if authState.loading}
	<DashboardSkeleton name={authState.profile?.name ?? undefined} />
{:else if !authState.isAuthenticated}
	<!-- Guard $effect above handles goto('/'); render nothing while redirect is in flight -->
{:else if devices.length === 0 && !deviceState.pairedDevicesLoaded}
	<DashboardSkeleton name={authState.profile?.name ?? undefined} />
{:else if waitingForSignInRoute}
	<!-- Fresh sign-in: hold the skeleton until smart-routing $effect decides
	     whether to stay or redirect to /dashboard/devices. Avoids flashing
	     an offline device before the redirect. -->
	<DashboardSkeleton name={authState.profile?.name ?? undefined} />
{:else if devices.length === 0}
	<main class="mx-auto w-full max-w-2xl xl:max-w-3xl">
		<DashboardEmptyState />
	</main>
{:else if !selectedDevice}
	<!-- Devices exist but MRU auto-select is in flight; render skeleton briefly -->
	<DashboardSkeleton name={authState.profile?.name ?? undefined} />
{:else}
	<main class="mx-auto w-full max-w-2xl xl:max-w-3xl">
		<div class="flex flex-col gap-4 sm:gap-5">
			<DashboardHero device={selectedDevice} />

			{#if isOffline}
				{#key statusPolling.tickCounter}
					<div
						role="status"
						aria-live="polite"
						class="flex items-start gap-3 rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-[var(--sl-text-1)]"
					>
						<AlertTriangle
							size={18}
							class="mt-0.5 shrink-0 text-amber-600 dark:text-amber-400"
							aria-hidden="true"
						/>
						<div class="min-w-0 flex-1">
							<p class="text-[0.875rem] font-medium">
								Device offline{offlineSince ? ` — last seen ${offlineSince}` : ''}
							</p>
							<p class="mt-0.5 text-[0.75rem] text-[var(--sl-text-2)]">
								{offlineSubtitle}
							</p>
						</div>
						<button
							type="button"
							class="shrink-0 rounded-md border border-[var(--sl-border)] bg-[var(--sl-bg-surface)] px-2.5 py-1 text-[0.75rem] font-medium text-[var(--sl-text-1)] transition-all duration-100 hover:bg-[var(--sl-bg-elevated)] focus-visible:outline-2 focus-visible:outline-primary active:scale-[0.96] active:bg-[var(--sl-bg-subtle)]"
							onclick={handleRefreshStatus}
							aria-label="Refresh device status"
						>
							Refresh
						</button>
					</div>
				{/key}
			{/if}

			<DashboardTiles />
		</div>
	</main>
{/if}

<BackupProgressModal
	onRetry={retryFailedBackup}
	onFullBackup={() => {
		const deviceId = deviceState.backupState.deviceId;
		if (deviceId) handleDownloadBackup(deviceId, true);
	}}
/>
