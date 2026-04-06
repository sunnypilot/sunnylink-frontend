<script lang="ts">
	import '../app.css';
	import favicon from '$lib/assets/favicon.png';
	import { page } from '$app/state';
	import { invalidate } from '$app/navigation';

	import { authState, logtoClient } from '$lib/logto/auth.svelte';
	import { deviceState } from '$lib/stores/device.svelte';
	import { deviceSelectorState } from '$lib/stores/deviceSelector.svelte';
	import {
		Bot,
		Car,
		ChevronDown,
		Gauge,
		HardDrive,
		House,
		LogIn,
		Map as MapIcon,
		Menu,
		Palette,
		Settings,
		ToggleLeft,
		Wind,
		Wrench,
		ArrowLeftRight,
		Smartphone
	} from 'lucide-svelte';
	import { checkDeviceStatus } from '$lib/api/device';
	import SettingsSearch from '$lib/components/SettingsSearch.svelte';
	import DeviceStatusPill from '$lib/components/DeviceStatusPill.svelte';
	import BackupStatusIndicator from '$lib/components/BackupStatusIndicator.svelte';
	import DeviceSelector from '$lib/components/DeviceSelector.svelte';
	import SettingsMigrationWizard from '$lib/components/SettingsMigrationWizard.svelte';
	import PairingModal from '$lib/components/PairingModal.svelte';
	import AccountMenu from '$lib/components/AccountMenu.svelte';
	import ForceOffroadBanner from '$lib/components/ForceOffroadBanner.svelte';
	import PendingChangesPill from '$lib/components/PendingChangesPill.svelte';
	import GlobalStatusBanner from '$lib/components/GlobalStatusBanner.svelte';
	import SyncStatusBanner from '$lib/components/SyncStatusBanner.svelte';
	import { Toaster } from 'svelte-sonner';
	// @ts-ignore - svelte-ios-pwa-prompt types/peer deps might be loose
	import PWAPrompt from 'svelte-ios-pwa-prompt';
	import { statusPolling } from '$lib/stores/statusPolling.svelte';
	import { pendingChanges } from '$lib/stores/pendingChanges.svelte';
	import { onMount } from 'svelte';

	let { children, data } = $props();

	type NavItem = { icon: any; label: string; href?: string; action?: (() => void) | undefined };
	type NavSection = { label: string; items: NavItem[]; collapsible?: boolean };

	let drawerOpen = $state(false);
	const pathname = $derived(page.url.pathname);

	// Collapsible section state
	let settingsOpen = $state(true);

	const getPageTitle = (path: string) => {
		const titles: Record<string, string> = {
			'/': 'Home',
			'/dashboard': 'Dashboard',
			'/dashboard/models': 'Models',
			'/dashboard/settings/device': 'Device Settings',
			'/dashboard/settings/toggles': 'Toggles',
			'/dashboard/settings/steering': 'Steering',
			'/dashboard/settings/cruise': 'Cruise',
			'/dashboard/settings/visuals': 'Visuals',
			'/dashboard/settings/vehicle': 'Vehicle',
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

	// Dashboard is a standalone top-level item (not a setting)
	let dashboardItem: NavItem | null = $derived(
		authState.isAuthenticated ? { icon: House, label: 'Dashboard', href: '/dashboard' } : null
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
							{ icon: MapIcon, label: 'Maps', href: '/dashboard/osm' },
							{ icon: Car, label: 'Vehicle', href: '/dashboard/settings/vehicle' },
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

	let selectedDeviceForBrand = $derived(
		devices.find((d: any) => d.device_id === deviceState.selectedDeviceId)
	);

	let sidebarDeviceAlias = $derived.by(() => {
		if (!deviceState.selectedDeviceId) return undefined;
		const did = deviceState.selectedDeviceId;
		return deviceState.aliases[did] ?? selectedDeviceForBrand?.alias ?? did;
	});

	let sidebarDeviceStatus = $derived(
		deviceState.selectedDeviceId
			? deviceState.onlineStatuses[deviceState.selectedDeviceId]
			: undefined
	);

	// Pending changes badge for sidebar
	let sidebarPendingCount = $derived.by(() => {
		if (!deviceState.selectedDeviceId) return 0;
		return pendingChanges.getByStatus(deviceState.selectedDeviceId, 'pending').length;
	});

	async function checkAllDevicesStatus(devices: any[]) {
		if (!logtoClient) return;
		const token = await logtoClient.getIdToken();
		if (!token) return;
		await Promise.all(
			devices.map((device) => {
				if (device.device_id) {
					return checkDeviceStatus(device.device_id, token);
				}
			})
		);
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

			if (result.devices.length > 0) {
				devices = result.devices;
				deviceState.pairedDevices = result.devices;
				deviceState.pairedDevicesLoaded = true;
				try {
					localStorage.setItem('sunnylink_paired_devices', JSON.stringify(result.devices));
				} catch {
					/* quota */
				}
				// Hydrate aliases from API so all components (DeviceStatusPill, etc.) can resolve names
				for (const d of result.devices) {
					if (d.device_id && d.alias && !deviceState.aliases[d.device_id]) {
						deviceState.aliases = { ...deviceState.aliases, [d.device_id]: d.alias };
					}
				}
				// Only run the initial status check once. Subsequent invalidate()
				// calls (e.g. from auth re-check) re-hydrate device list but skip
				// the status check — statusPolling handles ongoing updates.
				if (!statusCheckStarted) {
					statusCheckStarted = true;
					checkAllDevicesStatus(result.devices).then(() => {
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

	$effect(() => {
		if (authState.isAuthenticated) {
			invalidate('app:devices');
		}
	});

	onMount(async () => {
		const { pwaInfo } = await import('virtual:pwa-info');
		if (pwaInfo) {
			const { registerSW } = await import('virtual:pwa-register');
			const updateSW = registerSW({
				immediate: true,
				onRegistered(r) {
					console.log(`SW Registered: ${r}`);
				},
				onNeedRefresh() {
					updateSW(true);
				},
				onRegisterError(error) {
					console.log('SW registration error', error);
				}
			});
		}
	});

	let isLandingPage = $derived(pathname === '/');
</script>

<svelte:head>
	<title>{getPageTitle(pathname)}</title>
	<link rel="icon" href={favicon} />
</svelte:head>

<div
	class="drawer min-h-screen bg-[var(--sl-bg-page)] {!isLandingPage
		? 'lg:drawer-open'
		: 'h-auto overflow-visible'}"
>
	<input id="main-drawer" type="checkbox" class="drawer-toggle" bind:checked={drawerOpen} />

	<div
		class="drawer-content flex min-h-screen flex-col bg-[var(--sl-bg-page)] {isLandingPage
			? 'h-auto overflow-visible'
			: ''}"
	>
		<GlobalStatusBanner />

		{#if !isLandingPage}
			<header
				class="sticky top-0 z-50 w-full border-b border-[var(--sl-border)] bg-[var(--sl-bg-page)] px-4 py-2.5 sm:px-6"
			>
				<ForceOffroadBanner />
				<div class="flex items-center justify-between gap-3">
					<div class="flex items-center gap-3 lg:hidden">
						<label
							for="main-drawer"
							aria-label="open sidebar"
							class="btn btn-square text-[var(--sl-text-1)] btn-ghost btn-sm"
						>
							<Menu size={20} />
						</label>
						<p
							class="font-audiowide text-[0.75rem] font-semibold tracking-[0.20em] text-[var(--sl-text-3)] uppercase"
						>
							sunnylink
						</p>
					</div>

					<div class="flex flex-1 flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
						<div class="hidden flex-1 justify-center px-6 lg:flex">
							{#if deviceState.selectedDeviceId}
								<div class="w-full max-w-md">
									<SettingsSearch />
								</div>
							{/if}
						</div>

						<div class="hidden items-center gap-3 lg:flex">
							<DeviceStatusPill />
							{#await data.streamed.deviceResult then result}
								{#if result.error === 'auth_expired'}
									<button
										class="btn text-warning btn-ghost btn-sm"
										onclick={async () => {
											await logtoClient?.signIn(`${window.location.origin}/auth/callback`);
										}}
									>
										Session expired — Sign in
									</button>
								{:else if result.error === 'api_error'}
									<button
										class="btn text-error btn-ghost btn-sm"
										onclick={() => invalidate('app:devices')}
									>
										Failed to load — Retry
									</button>
								{/if}
							{/await}
						</div>
					</div>
				</div>

				{#if deviceState.selectedDeviceId}
					<div class="mt-2 flex items-center gap-3 lg:hidden">
						<div class="flex-1">
							<SettingsSearch />
						</div>
						<DeviceStatusPill />
					</div>
				{/if}
			</header>
		{/if}

		<main
			class="flex-1 {isLandingPage ? '' : 'overflow-y-auto px-4 py-6 sm:px-6 lg:px-10 lg:py-8'}"
		>
			{#if !isLandingPage && deviceState.selectedDeviceId}
				<div class="mx-auto mb-4 w-full max-w-2xl xl:max-w-3xl">
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

	{#if !isLandingPage}
		<div class="drawer-side z-[51]">
			<label for="main-drawer" aria-label="close sidebar" class="drawer-overlay"></label>
			<aside
				class={[
					'flex min-h-full flex-col border-r border-[var(--sl-border)] bg-[var(--sl-bg-surface)] transition-[width,filter] duration-300',
					drawerOpen ? 'w-72' : 'w-16',
					'lg:w-[18rem]',
					deviceSelectorState.isOpen ? 'blur-sm' : ''
				]}
			>
				<!-- Brand + Device Context -->
				<button
					type="button"
					class="flex h-14 w-full items-center gap-2 px-4 text-left transition-colors hover:bg-[var(--sl-bg-subtle)] lg:px-5"
					onclick={() => deviceSelectorState.toggle()}
				>
					<div class={['min-w-0 flex-1 space-y-0.5', drawerOpen ? 'block' : 'hidden', 'lg:block']}>
						<p
							class="font-audiowide text-[0.75rem] font-semibold tracking-[0.20em] text-[var(--sl-text-3)] uppercase"
						>
							sunnylink
						</p>
						{#if sidebarDeviceAlias}
							<div class="flex items-center gap-1.5">
								<span
									class="h-1.5 w-1.5 shrink-0 rounded-full {sidebarDeviceStatus === 'online'
										? 'bg-emerald-400'
										: sidebarDeviceStatus === 'offline'
											? 'bg-red-400'
											: sidebarDeviceStatus === 'error'
												? 'bg-amber-400'
												: 'animate-pulse bg-amber-400'}"
								></span>
								<span class="truncate text-sm font-medium text-[var(--sl-text-1)]">
									{sidebarDeviceAlias}
								</span>
								{#if sidebarPendingCount > 0}
									<span
										class="flex h-4 min-w-[1rem] items-center justify-center rounded-full bg-amber-500/20 px-1 text-[0.625rem] font-bold text-amber-700 dark:text-amber-400"
									>
										{sidebarPendingCount}
									</span>
								{/if}
							</div>
						{:else}
							<span class="text-sm text-[var(--sl-text-2)]">Select a device</span>
						{/if}
					</div>
					<ChevronDown
						size={14}
						class="shrink-0 text-[var(--sl-text-3)] transition-transform duration-200 {drawerOpen
							? 'block'
							: 'hidden'} lg:block {deviceSelectorState.isOpen ? 'rotate-180' : ''}"
					/>
				</button>

				<nav class="flex-1 overflow-y-auto px-3 py-3 lg:px-4">
					<!-- Dashboard (standalone, above settings sections) -->
					{#if dashboardItem}
						<ul class="mb-2 flex flex-col gap-0.5">
							{@render navItemSnippet(dashboardItem)}
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
					{#if authState.isAuthenticated}
						<div class={[drawerOpen ? 'block' : 'hidden', 'lg:block']}>
							<AccountMenu onNavigate={closeDrawerOnMobile} />
						</div>
					{:else}
						<button
							type="button"
							onclick={async () => {
								await logtoClient?.signIn(`${window.location.origin}/auth/callback`);
								closeDrawerOnMobile();
							}}
							class={[
								'group flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left transition-colors hover:bg-[var(--sl-bg-subtle)]',
								drawerOpen ? 'justify-start' : 'justify-center',
								'lg:justify-start'
							]}
						>
							<LogIn
								size={18}
								class="text-[var(--sl-text-2)] group-hover:text-[var(--sl-text-1)]"
							/>
							<span
								class={[
									'text-[0.8125rem] font-medium text-[var(--sl-text-2)] group-hover:text-[var(--sl-text-1)]',
									drawerOpen ? 'block' : 'hidden',
									'lg:block'
								]}
							>
								Login
							</span>
						</button>
					{/if}
				</div>
			</aside>
		</div>
	{/if}
</div>

<DeviceSelector {devices} triggerHidden />

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

<Toaster />
<PendingChangesPill />
{#if isIOS && !isLandingPage}
	<PWAPrompt
		copyTitle="Add to Home Screen"
		copyBody="This website has app functionality. Add it to your home screen to use it in fullscreen and while offline."
		copyShareButtonLabel="1) Press the 'Share' button"
		copyAddHomeButtonLabel="2) Press 'Add to Home Screen'"
		copyClosePrompt="Cancel"
		promptOnVisit={1}
		timesToShow={3}
		delay={3000}
		permanentlyHideOnDismiss={false}
		debug={false}
	/>
{/if}
