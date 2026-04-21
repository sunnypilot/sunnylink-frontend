<script lang="ts">
	import '../app.css';
	import favicon from '$lib/assets/favicon.png';
	import { page } from '$app/state';
	import { goto, invalidate, onNavigate } from '$app/navigation';

	import { authState, logtoClient } from '$lib/logto/auth.svelte';
	import { deviceState } from '$lib/stores/device.svelte';
	import {
		Bot,
		Car,
		ChevronDown,
		Gauge,
		HardDrive,
		House,
		LogIn,
		Loader2,
		Map as MapIcon,
		Menu,
		Monitor,
		Package,
		Palette,
		Settings,
		ToggleLeft,
		Wind,
		Wrench,
		ArrowLeftRight,
		Smartphone,
		X
	} from 'lucide-svelte';
	import { checkDeviceStatus } from '$lib/api/device';
	import SearchTrigger from '$lib/components/search/SearchTrigger.svelte';
	import CommandPalette from '$lib/components/search/CommandPalette.svelte';
	import DeviceStatusPill from '$lib/components/DeviceStatusPill.svelte';
	import BackupStatusIndicator from '$lib/components/BackupStatusIndicator.svelte';
	import SettingsMigrationWizard from '$lib/components/SettingsMigrationWizard.svelte';
	import PairingModal from '$lib/components/PairingModal.svelte';
	import AccountMenu from '$lib/components/AccountMenu.svelte';
	import ForceOffroadBanner from '$lib/components/ForceOffroadBanner.svelte';
	import PendingChangesPill from '$lib/components/PendingChangesPill.svelte';
	import GlobalStatusBanner from '$lib/components/GlobalStatusBanner.svelte';
	import SyncStatusBanner from '$lib/components/SyncStatusBanner.svelte';
	import { Toaster } from 'svelte-sonner';
	import { themeState } from '$lib/stores/theme.svelte';
	import PWAInstallPrompt from '$lib/components/PWAInstallPrompt.svelte';
	import { statusPolling } from '$lib/stores/statusPolling.svelte';
	import { pendingChanges } from '$lib/stores/pendingChanges.svelte';
	import { onMount } from 'svelte';
	import { fade, scale } from 'svelte/transition';

	let { children, data } = $props();

	type NavItem = { icon: any; label: string; href?: string; action?: (() => void) | undefined };
	type NavSection = { label: string; items: NavItem[]; collapsible?: boolean };

	let drawerOpen = $state(false);
	const pathname = $derived(page.url.pathname);

	// Smooth SPA transitions via the View Transitions API on browsers that support it.
	// SvelteKit's onNavigate fires before the new page mounts; wrapping navigation.complete
	// in startViewTransition lets the browser diff the DOM and crossfade. Skip entirely when
	// the user prefers reduced motion or the API is unavailable — nav proceeds instantly.
	onNavigate((navigation) => {
		if (typeof document === 'undefined') return;
		if (!('startViewTransition' in document)) return;
		if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

		return new Promise((resolve) => {
			(document as any).startViewTransition(async () => {
				resolve();
				await navigation.complete;
			});
		});
	});

	// Collapsible section state
	let settingsOpen = $state(true);

	const getPageTitle = (path: string) => {
		const titles: Record<string, string> = {
			'/': 'Home',
			'/dashboard': 'Home',
			'/dashboard/models': 'Models',
			'/dashboard/settings/device': 'Device Settings',
			'/dashboard/settings/toggles': 'Toggles',
			'/dashboard/settings/steering': 'Steering',
			'/dashboard/settings/cruise': 'Cruise',
			'/dashboard/settings/visuals': 'Visuals',
			'/dashboard/settings/vehicle': 'Vehicle',
			'/dashboard/settings/display': 'Display',
			'/dashboard/settings/software': 'Software',
			'/dashboard/settings/developer': 'Developer',
			'/dashboard/osm': 'Maps',
			'/dashboard/preferences': 'Preferences'
		};
		return `sunnylink${titles[path] ? ` - ${titles[path]}` : ''}`;
	};

	const closeDrawerOnMobile = () => {
		if (typeof window !== 'undefined' && window.innerWidth < 1024) {
			drawerOpen = false;
		}
	};

	$effect(() => {
		if (typeof window !== 'undefined' && window.innerWidth >= 1024) {
			drawerOpen = true;
		}
	});

	// Top-level items (Home, My Devices) — standalone, above any settings section
	let topLevelItems: NavItem[] = $derived(
		authState.isAuthenticated
			? [
					{ icon: House, label: 'Home', href: '/dashboard' },
					{ icon: Smartphone, label: 'My Devices', href: '/dashboard/devices' }
				]
			: []
	);

	let navSections = $derived<NavSection[]>(
		authState.isAuthenticated && deviceState.selectedDeviceId
			? [
					{
						label: 'Device Settings',
						items: [
							{ icon: HardDrive, label: 'Device', href: '/dashboard/settings/device' },
							{ icon: ToggleLeft, label: 'Toggles', href: '/dashboard/settings/toggles' },
							{ icon: Bot, label: 'Models', href: '/dashboard/models' },
							{ icon: Gauge, label: 'Steering', href: '/dashboard/settings/steering' },
							{ icon: Wind, label: 'Cruise', href: '/dashboard/settings/cruise' },
							{ icon: Palette, label: 'Visuals', href: '/dashboard/settings/visuals' },
							{ icon: Monitor, label: 'Display', href: '/dashboard/settings/display' },
							{ icon: MapIcon, label: 'Maps', href: '/dashboard/osm' },
							{ icon: Car, label: 'Vehicle', href: '/dashboard/settings/vehicle' },
							{ icon: Package, label: 'Software', href: '/dashboard/settings/software' },
							{ icon: Wrench, label: 'Developer', href: '/dashboard/settings/developer' }
						]
					}
				]
			: []
	);

	// Utility items always visible in sidebar
	let utilityItems: NavItem[] = [
		{
			icon: ArrowLeftRight,
			label: 'Migration Wizard',
			action: () => deviceState.openMigrationWizard()
		},
		{
			icon: Smartphone,
			label: 'Pair Device',
			action: () => deviceState.openPairingModal()
		}
	];

	const isActive = (href?: string) => href === pathname;

	const navItemClasses = (active: boolean) =>
		[
			'group relative flex w-full items-center gap-3 rounded-lg px-3.5 py-2.5 text-sm transition-colors duration-150',
			drawerOpen ? 'justify-start' : 'justify-center',
			'lg:justify-start',
			active
				? 'bg-[var(--sl-accent-muted)] text-[var(--sl-text-1)] font-medium'
				: 'text-[var(--sl-text-2)] hover:bg-[var(--sl-bg-subtle)] hover:text-[var(--sl-text-1)]'
		].join(' ');

	let devices = $state<any[]>([]);
	let deviceFetchError = $state<import('./+layout').DeviceFetchError>(null);

	async function checkSelectedDeviceStatus(deviceId: string) {
		if (!logtoClient) return;
		const token = await logtoClient.getIdToken();
		if (!token) return;
		await checkDeviceStatus(deviceId, token);
	}

	let authRetried = false;
	let statusCheckStarted = false;
	$effect(() => {
		data.streamed.deviceResult.then(async (result) => {
			deviceFetchError = result.error;

			// One-time silent session refresh when token is stale
			if (result.error === 'auth_expired' && authState.isAuthenticated && !authRetried) {
				authRetried = true;
				// Re-run full session check (equivalent to page refresh)
				const refreshed = await authState.refreshSession();
				if (refreshed) {
					// Session restored — re-fetch devices with fresh token
					invalidate('app:devices');
					return;
				}
				// Session truly expired — header shows "Session expired — Sign in"
			}

			if (result.pairedList.length > 0) {
				// Merge the rich selected-device detail back into the lightweight
				// list so consumers that only need device_id / created_at can read
				// from pairedDevices uniformly. /dashboard/devices hydrates the
				// rest with their own detail fetches when visited.
				const detailById = new Map(
					result.devices.filter((d: any) => d.device_id).map((d: any) => [d.device_id, d])
				);
				const merged = result.pairedList.map((item: any) => {
					if (item.device_id && detailById.has(item.device_id)) {
						return { ...item, ...detailById.get(item.device_id) };
					}
					return item;
				});
				devices = merged;
				deviceState.pairedDevices = merged;
				deviceState.pairedDevicesLoaded = true;
				// Hydrate aliases from any device that has one (only selected so far on root)
				for (const d of merged) {
					if (d.device_id && d.alias && !deviceState.aliases[d.device_id]) {
						deviceState.aliases = { ...deviceState.aliases, [d.device_id]: d.alias };
					}
				}
				// Resolve selectedDeviceId. Only clear if the persisted selection is
				// stale (device removed from the account); we no longer auto-fall-back
				// to ids[0], because surprise-picking a random (often offline) device
				// on fresh sign-in confused users. /dashboard/+page.svelte's smart
				// routing sends them to /dashboard/devices to pick when there's no
				// valid selection.
				const ids = merged.map((d: any) => d.device_id).filter(Boolean);
				if (deviceState.selectedDeviceId && !ids.includes(deviceState.selectedDeviceId)) {
					deviceState.setSelectedDevice(null);
				}
				// Only run the initial status check once. Per the device-fetch policy,
				// the root layout polls only the selected device — /dashboard/devices
				// page kicks off all-devices status checks when visited.
				if (!statusCheckStarted && deviceState.selectedDeviceId) {
					statusCheckStarted = true;
					checkSelectedDeviceStatus(deviceState.selectedDeviceId).then(() => {
						statusPolling.markChecked();
						statusPolling.start();
					});
				}
			}
		});
	});

	let isIOS = $state(false);
	onMount(() => {
		const ua = window.navigator.userAgent;
		isIOS = /iPad|iPhone|iPod/.test(ua) && !(window as any).MSStream;
	});

	// Session-expired modal: only on auth-required routes (/dashboard/*). Landing
	// is public and the OAuth callback is transitional, so the modal would block
	// the user from browsing or race the sign-in code exchange respectively.
	// Triggers when EITHER the initial load reported auth_expired (refresh-on-
	// land case) OR a mid-use API call detected the session died (proactive
	// 401-on-action case via authState.markSessionExpired). Also gated on
	// !authState.loading so it doesn't flash during the init / refresh-grant
	// window when the SDK is still resolving stale tokens.
	let isAuthRequiredRoute = $derived(pathname.startsWith('/dashboard'));
	let showSessionExpiredModal = $derived(
		isAuthRequiredRoute &&
			!authState.loading &&
			(authState.sessionExpired ||
				(!authState.isAuthenticated && deviceFetchError === 'auth_expired'))
	);

	function dismissSessionExpired() {
		// Clear both signals so the modal stays gone after dismissal. If the
		// user later navigates back to /dashboard without re-authing, the
		// modal naturally re-triggers via the next invalidate('app:devices')
		// returning auth_expired, or the next API click marking expired again.
		deviceFetchError = null;
		authState.sessionExpired = false;
		goto('/');
	}

	// Esc-to-dismiss for the session-expired modal. Listener attaches only while
	// the modal is open so we don't leak handlers.
	$effect(() => {
		if (!showSessionExpiredModal) return;
		const handler = (e: KeyboardEvent) => {
			if (e.key === 'Escape') dismissSessionExpired();
		};
		window.addEventListener('keydown', handler);
		return () => window.removeEventListener('keydown', handler);
	});

	// Tab-visibility session revalidation — when the user returns to a tab left
	// open for hours, ping the SDK to catch sessions that died on the server
	// (rotated secrets, admin revoke, etc.) before they click something and
	// see a broken UI. Throttled to once per 60s to keep request volume low
	// at the 100k-user scale (would be ~1.6k checks/min at constant focus
	// flipping — still fine, but no need to be aggressive).
	let lastVisibilityValidationAt = 0;
	const VISIBILITY_REVALIDATE_MS = 60_000;
	$effect(() => {
		if (typeof document === 'undefined') return;
		const handler = () => {
			if (document.visibilityState !== 'visible') return;
			if (!authState.isAuthenticated) return;
			if (Date.now() - lastVisibilityValidationAt < VISIBILITY_REVALIDATE_MS) return;
			lastVisibilityValidationAt = Date.now();
			authState.validateSessionQuiet();
		};
		document.addEventListener('visibilitychange', handler);
		return () => document.removeEventListener('visibilitychange', handler);
	});

	$effect(() => {
		if (authState.isAuthenticated) {
			invalidate('app:devices');
		}
	});

	onMount(async () => {
		const { pwaInfo } = await import('virtual:pwa-info');
		if (pwaInfo) {
			const { registerSW } = await import('virtual:pwa-register');
			// registerType: 'autoUpdate' (vite.config.ts) handles SW activation itself.
			// A manual updateSW(true) here reloads the page on every SW update — in dev
			// that fires on HMR rebuilds and breaks the auth-callback → dashboard nav
			// mid-flight. Leave onNeedRefresh as a no-op.
			registerSW({
				immediate: true,
				onRegistered(r) {
					console.log(`SW Registered: ${r}`);
				},
				onRegisterError(error) {
					console.log('SW registration error', error);
				}
			});
		}
	});

	let isLandingPage = $derived(pathname === '/');
	// Hide app chrome (sidebar/header/PWA prompt) on full-screen transitional
	// pages — landing and the OAuth callback. Avoids flashing an unauthed
	// sidebar during the sign-in round-trip.
	let isChromeless = $derived(isLandingPage || pathname === '/auth/callback');
</script>

<svelte:head>
	<title>{getPageTitle(pathname)}</title>
	<link rel="icon" href={favicon} />
</svelte:head>

<div
	class="drawer min-h-screen bg-[var(--sl-bg-page)] {!isChromeless
		? 'lg:drawer-open'
		: 'h-auto overflow-visible'}"
>
	<input id="main-drawer" type="checkbox" class="drawer-toggle" bind:checked={drawerOpen} />

	<div
		class="drawer-content flex min-h-screen flex-col bg-[var(--sl-bg-page)] {isChromeless
			? 'h-auto overflow-visible'
			: ''}"
	>
		<GlobalStatusBanner />

		{#if !isChromeless}
			<header
				class="sticky top-0 z-50 w-full border-b border-[var(--sl-border)] bg-[var(--sl-bg-page)] px-4 py-2.5 sm:px-6"
			>
				<ForceOffroadBanner />
				<div class="flex items-center justify-between gap-3">
					<label
						for="main-drawer"
						aria-label="open sidebar"
						class="btn btn-square text-[var(--sl-text-1)] btn-ghost btn-sm lg:hidden"
					>
						<Menu size={20} />
					</label>

					<div class="hidden flex-1 items-center justify-between gap-3 lg:flex">
						<div class="flex flex-1 justify-center px-6">
							{#if deviceState.selectedDeviceId}
								<div class="w-full max-w-md">
									<SearchTrigger />
								</div>
							{/if}
						</div>

						<div class="flex items-center gap-3">
							{#if deviceState.selectedDeviceId}
								<a
									href="/dashboard/devices"
									class="inline-flex min-h-[36px] items-center gap-1.5 rounded-full px-2.5 py-1.5 text-[0.75rem] font-medium text-[var(--sl-text-3)] transition-colors hover:bg-[var(--sl-bg-elevated)] hover:text-[var(--sl-text-1)] focus-visible:outline-2 focus-visible:outline-primary"
									aria-label="Change selected device"
								>
									<ArrowLeftRight size={14} aria-hidden="true" />
									<span>Change device</span>
								</a>
							{/if}
							<DeviceStatusPill />
							{#if authState.loading}
								<span
									class="loading loading-spinner text-[var(--sl-text-3)]"
									style="width: 16px; height: 16px;"
									aria-label="Checking session"
								></span>
							{:else}
								{#await data.streamed.deviceResult then result}
									{#if result.error === 'api_error'}
										<button
											class="btn text-error btn-ghost btn-sm"
											onclick={() => invalidate('app:devices')}
										>
											Failed to load — Retry
										</button>
									{/if}
								{/await}
							{/if}
						</div>
					</div>

					{#if deviceState.selectedDeviceId}
						<div class="flex items-center gap-2 lg:hidden">
							<a
								href="/dashboard/devices"
								class="inline-flex h-9 w-9 items-center justify-center rounded-full text-[var(--sl-text-3)] transition-colors hover:bg-[var(--sl-bg-elevated)] hover:text-[var(--sl-text-1)] focus-visible:outline-2 focus-visible:outline-primary"
								aria-label="Change selected device"
							>
								<ArrowLeftRight size={16} aria-hidden="true" />
							</a>
							<DeviceStatusPill />
						</div>
					{/if}
				</div>

				{#if deviceState.selectedDeviceId}
					<div class="mt-2 lg:hidden">
						<SearchTrigger />
					</div>
				{/if}
			</header>
		{/if}

		<main class="flex-1 {isChromeless ? '' : 'px-4 py-4 sm:px-6 sm:py-6 lg:px-10 lg:py-8'}">
			{#if !isChromeless && deviceState.selectedDeviceId}
				<div class="mx-auto w-full max-w-2xl xl:max-w-3xl">
					<SyncStatusBanner deviceId={deviceState.selectedDeviceId} />
				</div>
			{/if}
			{#key pathname}
				<div class="animate-page-enter">
					{@render children()}
				</div>
			{/key}
		</main>
	</div>

	{#if !isChromeless}
		<div class="drawer-side z-[51]">
			<label for="main-drawer" aria-label="close sidebar" class="drawer-overlay"></label>
			<aside
				class={[
					'flex min-h-full flex-col border-r border-[var(--sl-border)] bg-[var(--sl-bg-surface)] transition-[width] duration-300',
					drawerOpen ? 'w-72' : 'w-16',
					'lg:w-[18rem]'
				]}
			>
				<!-- Brand wordmark (non-interactive) -->
				<div class="flex h-14 w-full items-center px-4 lg:px-5">
					<p
						class={[
							'font-audiowide text-[0.75rem] font-semibold tracking-[0.20em] text-[var(--sl-text-2)] uppercase',
							drawerOpen ? 'block' : 'hidden',
							'lg:block'
						]}
					>
						sunnylink
					</p>
				</div>

				<nav class="flex-1 overflow-y-auto px-3 py-3 lg:px-4">
					<!-- Auth init in flight — show skeleton rows so the sidebar doesn't
						 flash empty or flip to the logged-out view during the refresh
						 grant window. -->
					{#if authState.loading}
						<ul class="mb-2 flex flex-col gap-0.5" aria-hidden="true">
							{#each [0, 1] as _}
								<li class="list-none">
									<div class="flex items-center gap-3 rounded-lg px-3.5 py-2.5">
										<div
											class="h-5 w-5 shrink-0 animate-pulse rounded bg-[var(--sl-bg-elevated)]"
										></div>
										<div
											class={[
												'h-3 w-24 animate-pulse rounded bg-[var(--sl-bg-elevated)]',
												drawerOpen ? 'block' : 'hidden',
												'lg:block'
											]}
										></div>
									</div>
								</li>
							{/each}
						</ul>
						<div class="mx-2 my-2 border-b border-[var(--sl-border-muted)]"></div>
						<div class="mb-1 px-3 py-1.5">
							<div
								class={[
									'h-2.5 w-20 animate-pulse rounded bg-[var(--sl-bg-elevated)]',
									drawerOpen ? 'block' : 'hidden',
									'lg:block'
								]}
							></div>
						</div>
						<ul class="flex flex-col gap-0.5" aria-hidden="true">
							{#each [0, 1, 2, 3, 4, 5, 6, 7, 8] as _}
								<li class="list-none">
									<div class="flex items-center gap-3 rounded-lg px-3.5 py-2.5">
										<div
											class="h-5 w-5 shrink-0 animate-pulse rounded bg-[var(--sl-bg-elevated)]"
										></div>
										<div
											class={[
												'h-3 w-20 animate-pulse rounded bg-[var(--sl-bg-elevated)]',
												drawerOpen ? 'block' : 'hidden',
												'lg:block'
											]}
										></div>
									</div>
								</li>
							{/each}
						</ul>
					{:else}
						<!-- Top-level items (standalone, above settings sections) -->
						{#if topLevelItems.length > 0}
							<ul class="mb-2 flex flex-col gap-0.5">
								{#each topLevelItems as item}
									{@render navItemSnippet(item)}
								{/each}
							</ul>
						{/if}

						{#each navSections as section, si}
							{#if si > 0}
								<div class="mx-2 my-2 border-b border-[var(--sl-border-muted)]"></div>
							{/if}

							{#if section.collapsible}
								<button
									class="flex w-full items-center justify-between px-3 py-1.5 text-xs font-semibold tracking-wider text-[var(--sl-text-3)] uppercase transition-colors hover:text-[var(--sl-text-2)]"
									onclick={() => (settingsOpen = !settingsOpen)}
								>
									<span class={[drawerOpen ? 'block' : 'hidden', 'lg:block']}>{section.label}</span>
									<ChevronDown
										size={12}
										class="transition-transform duration-150 {settingsOpen
											? ''
											: '-rotate-90'} {drawerOpen ? 'block' : 'hidden'} lg:block"
									/>
								</button>
								<div
									class="grid transition-[grid-template-rows] duration-200 ease-in-out"
									style="grid-template-rows: {settingsOpen ? '1fr' : '0fr'};"
								>
									<ul class="mt-0.5 flex flex-col gap-0.5 overflow-hidden">
										{#each section.items as item}
											{@render navItemSnippet(item)}
										{/each}
									</ul>
								</div>
							{:else}
								<div class="mb-1 px-3 py-1.5">
									<span
										class={[
											'text-xs font-semibold tracking-wider text-[var(--sl-text-3)] uppercase',
											drawerOpen ? 'block' : 'hidden',
											'lg:block'
										]}
									>
										{section.label}
									</span>
								</div>
								<ul class="flex flex-col gap-0.5">
									{#each section.items as item}
										{@render navItemSnippet(item)}
									{/each}
								</ul>
							{/if}
						{/each}
					{/if}

					<!-- Utility items (device-level, e.g. Migration Wizard) -->
					{#if utilityItems.length > 0}
						<div class="mx-2 my-2 border-b border-[var(--sl-border-muted)]"></div>
						<ul class="flex flex-col gap-0.5">
							{#each utilityItems as item}
								{@render navItemSnippet(item)}
							{/each}
						</ul>
					{/if}
				</nav>

				{#snippet navItemSnippet(item: NavItem)}
					{@const active = isActive(item.href)}
					{@const Icon = item.icon}
					<li class="list-none">
						{#if item.href}
							<a
								href={item.href}
								onclick={closeDrawerOnMobile}
								class={navItemClasses(active)}
								aria-current={active ? 'page' : undefined}
							>
								{#if active}
									<span
										class="absolute top-1/2 left-0 h-4 w-[3px] -translate-y-1/2 rounded-r-full bg-primary"
									></span>
								{/if}
								<Icon class="size-5 shrink-0" />
								<span class={[drawerOpen ? 'block' : 'hidden', 'lg:block']}>
									{item.label}
								</span>
							</a>
						{:else if item.action}
							<button
								type="button"
								onclick={() => {
									item.action?.();
									closeDrawerOnMobile();
								}}
								class={navItemClasses(active)}
							>
								<Icon class="size-5 shrink-0" />
								<span class={[drawerOpen ? 'block' : 'hidden', 'lg:block']}>
									{item.label}
								</span>
							</button>
						{/if}
					</li>
				{/snippet}

				<div class="border-t border-[var(--sl-border-muted)] px-4 py-3">
					{#if authState.loading}
						<!-- Skeleton row matching account/login footer height -->
						<div class="flex items-center gap-2.5 rounded-lg px-3 py-2" aria-hidden="true">
							<div
								class="h-8 w-8 shrink-0 animate-pulse rounded-full bg-[var(--sl-bg-elevated)]"
							></div>
							<div
								class={[
									'h-3 w-24 animate-pulse rounded bg-[var(--sl-bg-elevated)]',
									drawerOpen ? 'block' : 'hidden',
									'lg:block'
								]}
							></div>
						</div>
					{:else if authState.isAuthenticated}
						<div class={[drawerOpen ? 'block' : 'hidden', 'lg:block']}>
							<AccountMenu onNavigate={closeDrawerOnMobile} />
						</div>
					{:else}
						<button
							type="button"
							disabled={authState.isSigningIn}
							onclick={async () => {
								closeDrawerOnMobile();
								await authState.signIn(`${window.location.origin}/auth/callback`);
							}}
							class={[
								'group flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left transition-colors hover:bg-[var(--sl-bg-subtle)] disabled:cursor-not-allowed disabled:opacity-70 disabled:hover:bg-transparent',
								drawerOpen ? 'justify-start' : 'justify-center',
								'lg:justify-start'
							]}
						>
							{#if authState.isSigningIn}
								<Loader2
									size={18}
									class="animate-spin text-[var(--sl-text-2)]"
									aria-hidden="true"
								/>
							{:else}
								<LogIn
									size={18}
									class="text-[var(--sl-text-2)] group-hover:text-[var(--sl-text-1)]"
								/>
							{/if}
							<span
								class={[
									'text-[0.8125rem] font-medium text-[var(--sl-text-2)] group-hover:text-[var(--sl-text-1)]',
									drawerOpen ? 'block' : 'hidden',
									'lg:block'
								]}
							>
								{authState.isSigningIn ? 'Signing in…' : 'Login'}
							</span>
						</button>
					{/if}
				</div>
			</aside>
		</div>
	{/if}
</div>

<BackupStatusIndicator />

<SettingsMigrationWizard
	bind:open={deviceState.migrationState.isOpen}
	deviceId={deviceState.migrationState.targetDeviceId}
	{devices}
/>

<PairingModal
	bind:open={deviceState.pairingState.isOpen}
	bind:deviceType={deviceState.pairingState.deviceType}
/>

<Toaster theme={themeState.effective} position="top-center" richColors />
<PendingChangesPill />
<CommandPalette />

{#if showSessionExpiredModal}
	<!-- svelte-ignore a11y_click_events_have_key_events -->
	<!-- svelte-ignore a11y_no_static_element_interactions -->
	<div
		class="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 px-4"
		role="dialog"
		aria-modal="true"
		aria-labelledby="session-expired-title"
		transition:fade={{ duration: 200 }}
		onclick={(e) => {
			if (e.target === e.currentTarget) dismissSessionExpired();
		}}
	>
		<div
			class="relative w-full max-w-sm rounded-xl border border-[var(--sl-border)] bg-[var(--sl-bg-surface)] p-6 shadow-xl"
			transition:scale={{ start: 0.96, duration: 200, opacity: 0 }}
		>
			<button
				type="button"
				class="absolute top-3 right-3 inline-flex h-8 w-8 items-center justify-center rounded-md text-[var(--sl-text-3)] transition-colors hover:bg-[var(--sl-bg-elevated)] hover:text-[var(--sl-text-1)] focus-visible:outline-2 focus-visible:outline-primary"
				onclick={dismissSessionExpired}
				aria-label="Dismiss and return home"
			>
				<X size={16} />
			</button>
			<h2
				id="session-expired-title"
				class="pr-8 text-[1.0625rem] font-semibold text-[var(--sl-text-1)]"
			>
				Session expired
			</h2>
			<p class="mt-2 text-[0.875rem] leading-relaxed text-[var(--sl-text-2)]">
				Sign in again to continue, or close this to browse the home page.
			</p>
			<button
				type="button"
				disabled={authState.isSigningIn}
				class="mt-5 inline-flex h-10 w-full items-center justify-center gap-2 rounded-lg bg-primary px-4 text-[0.875rem] font-medium text-white transition-colors hover:opacity-90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary disabled:cursor-not-allowed disabled:opacity-70 disabled:hover:opacity-70"
				onclick={() => authState.signIn(`${window.location.origin}/auth/callback`)}
			>
				{#if authState.isSigningIn}
					<Loader2 size={14} class="animate-spin" aria-hidden="true" />
					<span>Signing in…</span>
				{:else}
					Sign in
				{/if}
			</button>
			<button
				type="button"
				class="mt-2 inline-flex h-9 w-full items-center justify-center rounded-lg px-4 text-[0.8125rem] font-medium text-[var(--sl-text-2)] transition-colors hover:bg-[var(--sl-bg-elevated)] hover:text-[var(--sl-text-1)] focus-visible:outline-2 focus-visible:outline-primary"
				onclick={dismissSessionExpired}
			>
				Maybe later
			</button>
		</div>
	</div>
{/if}
{#if isIOS && !isChromeless}
	<PWAInstallPrompt
		title="Install sunnylink"
		body="Add to your Home Screen for fullscreen access and offline use."
		shareLabel="Tap the Share button in Safari's toolbar"
		addLabel={'Choose "Add to Home Screen"'}
		dismissLabel="Not now"
		promptOnVisit={1}
		timesToShow={3}
		delayMs={3000}
		permanentlyHideOnDismiss={false}
	/>
{/if}
