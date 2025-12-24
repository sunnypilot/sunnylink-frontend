<script lang="ts">
	import '../app.css';
	import favicon from '$lib/assets/favicon.png';
	import { page } from '$app/state';
	import { invalidateAll } from '$app/navigation';

	import {
		authState,
		logtoClient,
		isNetlifyPreview,
		PRODUCTION_ORIGIN
	} from '$lib/logto/auth.svelte';
	import { deviceState } from '$lib/stores/device.svelte';
	import { deviceSelectorState } from '$lib/stores/deviceSelector.svelte';
	import {
		Bot,
		CloudSun,
		Gauge,
		HardDrive,
		House,
		LifeBuoy,
		LogIn,
		LogOut,
		Map as MapIcon,
		Menu,
		Palette,
		Settings,
		ToggleLeft,
		Wind,
		Wrench,
		ArrowLeftRight,
		Car
	} from 'lucide-svelte';

	let { children, data } = $props();
	type NavItem = { icon: any; label: string; href?: string; action?: () => void };

	let drawerOpen = $state(false);
	const pathname = $derived(page.url.pathname);

	const getPageTitle = (path: string) => {
		const titles: Record<string, string> = {
			'/': 'Home',
			'/dashboard': 'Overview',
			'/dashboard/models': 'Models',
			'/dashboard/settings/device': 'Device Settings',
			'/dashboard/settings/toggles': 'Toggles',
			'/dashboard/settings/steering': 'Steering',
			'/dashboard/settings/cruise': 'Cruise',
			'/dashboard/settings/visuals': 'Visuals',
			'/dashboard/settings/developer': 'Developer',
			'/dashboard/settings/other': 'Other',
			'/dashboard/preferences': 'Preferences'
		};
		return `sunnylink${titles[path] ? ` - ${titles[path]}` : ''}`;
	};

	const handleLogout = async () => {
		await logtoClient?.signOut(window.location.origin);
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

	let navItems = $derived(
		authState.isAuthenticated
			? [
					{ icon: House, label: 'Overview', href: '/dashboard' },
					...(deviceState.selectedDeviceId
						? [
								{ icon: Bot, label: 'Models', href: '/dashboard/models' },
								{ icon: Car, label: 'Vehicle', href: '/dashboard/settings/vehicle' },
								{ icon: Settings, label: 'Device Settings', href: '/dashboard/settings/device' },
								{ icon: ToggleLeft, label: 'Toggles', href: '/dashboard/settings/toggles' },
								{ icon: Gauge, label: 'Steering', href: '/dashboard/settings/steering' },
								{ icon: Wind, label: 'Cruise', href: '/dashboard/settings/cruise' },
								{ icon: Palette, label: 'Visuals', href: '/dashboard/settings/visuals' },
								{ icon: Wrench, label: 'Developer', href: '/dashboard/settings/developer' },
								{ icon: Settings, label: 'Other', href: '/dashboard/settings/other' }
							]
						: [])
				]
			: []
	);

	let bottomNavItems = $derived(
		[
			deviceState.selectedDeviceId
				? {
						icon: ArrowLeftRight,
						label: 'Device Migration Wizard',
						action: () => deviceState.openMigrationWizard()
					}
				: null,
			{ icon: LifeBuoy, label: 'Support', href: 'https://community.sunnypilot.ai/c/bug-reports/8' },
			{ icon: Settings, label: 'Preferences', href: '/dashboard/preferences' },
			authState.isAuthenticated ? { icon: LogOut, label: 'Logout', action: handleLogout } : null
		].filter((item) => item !== null)
	);

	const navItemClasses = (isActive: boolean) =>
		[
			'flex items-center gap-3 rounded-xl border px-4 py-3 text-sm transition-colors duration-200 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#6366f1]',
			drawerOpen ? 'justify-start' : 'justify-center',
			'lg:justify-start',
			isActive
				? 'border-[#334155] bg-[#1e293b] text-white shadow-inner'
				: 'border-transparent text-slate-400 hover:border-[#1e293b] hover:bg-[#1e293b]/80 hover:text-white'
		].join(' ');
	import { checkDeviceStatus } from '$lib/api/device';
	import DeviceSelector from '$lib/components/DeviceSelector.svelte';
	import SettingsSearch from '$lib/components/SettingsSearch.svelte';
	import BackupStatusIndicator from '$lib/components/BackupStatusIndicator.svelte';
	import SettingsMigrationWizard from '$lib/components/SettingsMigrationWizard.svelte';
	import Toast from '$lib/components/Toast.svelte';
	import ForceOffroadBanner from '$lib/components/ForceOffroadBanner.svelte';
	import GlobalStatusBanner from '$lib/components/GlobalStatusBanner.svelte';
	// @ts-ignore - svelte-ios-pwa-prompt types/peer deps might be loose
	import PWAPrompt from 'svelte-ios-pwa-prompt';
	import { onMount } from 'svelte';

	let devices = $state<any[]>([]);

	async function checkAllDevicesStatus(devices: any[]) {
		if (!logtoClient) return;
		const token = await logtoClient.getIdToken();
		if (!token) return;

		// Check status for all devices in parallel
		await Promise.all(
			devices.map((device) => {
				if (device.device_id) {
					return checkDeviceStatus(device.device_id, token);
				}
			})
		);
	}

	$effect(() => {
		data.streamed.devices.then((d) => {
			if (d && d.length > 0) {
				devices = d;
				checkAllDevicesStatus(d);
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
			invalidateAll();
		}
	});

	onMount(async () => {
		const { pwaInfo } = await import('virtual:pwa-info');
		if (pwaInfo) {
			const { registerSW } = await import('virtual:pwa-register');
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
</script>

<svelte:head>
	<title>{getPageTitle(pathname)}</title>
	<link rel="icon" href={favicon} />
</svelte:head>

<div class="drawer min-h-screen bg-[#0f1726] lg:drawer-open">
	<input id="main-drawer" type="checkbox" class="drawer-toggle" bind:checked={drawerOpen} />
	<div class="drawer-content flex min-h-screen flex-col bg-[#0f1726]">
		<GlobalStatusBanner />
		<!-- Navbar for mobile -->
		<header
			class="sticky top-0 z-50 w-full border-b border-[#1e293b] bg-[#0f1726] px-4 py-3 sm:px-6"
		>
			<div class="flex items-center justify-between gap-3">
				<div class="flex items-center gap-3 lg:hidden">
					<label
						for="main-drawer"
						aria-label="open sidebar"
						class="btn btn-square text-white btn-ghost"
					>
						<Menu size={22} />
					</label>
					<p
						class="font-audiowide text-xs font-semibold tracking-widest text-slate-300 uppercase sm:text-sm sm:tracking-[0.35em]"
					>
						sunnylink
					</p>
				</div>

				<!-- Device Selector & Search -->
				<div class="flex flex-1 flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
					<!-- Desktop Search -->
					<div class="hidden flex-1 justify-center px-6 lg:flex">
						{#if deviceState.selectedDeviceId}
							<SettingsSearch />
						{/if}
					</div>

					{#await data.streamed.devices}
						<div
							class="h-10 w-48 animate-pulse self-end rounded-lg bg-[#1e293b] lg:self-auto"
						></div>
					{:then devices}
						{#if devices && devices.length > 0}
							<div class="flex min-w-0 flex-1 justify-end self-end lg:flex-none lg:self-auto">
								<DeviceSelector {devices} />
							</div>
						{:else}
							<span class="self-end text-sm text-slate-400 lg:self-auto">No devices found</span>
						{/if}
					{/await}
				</div>
			</div>

			<!-- Mobile Search Row -->
			{#if deviceState.selectedDeviceId}
				<div class="mt-3 lg:hidden">
					<SettingsSearch />
				</div>
			{/if}
		</header>

		<!-- Page content -->
		<main class="flex-1 overflow-y-auto px-4 py-6 sm:px-6 lg:px-10 lg:py-10">
			{@render children()}
		</main>
	</div>

	<div class="drawer-side z-[51]">
		<label for="main-drawer" aria-label="close sidebar" class="drawer-overlay"></label>
		<aside
			class={[
				'flex min-h-full flex-col border-r border-[#1e293b] bg-[#0f1726] transition-[width,filter] duration-300',
				drawerOpen ? 'w-64 sm:w-72' : 'w-16 sm:w-20',
				'lg:w-80 lg:min-w-[20rem]',
				deviceSelectorState.isOpen ? 'blur-sm' : ''
			]}
		>
			<!-- Logo Area -->
			<div class="flex h-16 items-center gap-3 px-3 sm:h-20 sm:gap-4 sm:px-4 lg:px-6">
				<div
					class="badge h-8 w-8 rounded-md border-[#334155] p-0 font-mono text-[0.6rem] tracking-widest text-white badge-neutral"
				>
					SP
				</div>
				<div class={['space-y-0.5 text-slate-200', drawerOpen ? 'block' : 'hidden', 'lg:block']}>
					<p class="font-audiowide text-[0.65rem] tracking-[0.35em] text-slate-500 uppercase">
						sunnylink
					</p>
					<h1 class="text-base font-semibold">Control Center</h1>
				</div>
			</div>

			<!-- Navigation -->
			<nav class="flex-1 px-2 py-4 sm:px-3 sm:py-6 lg:px-4">
				<ul class="menu gap-2 p-0 text-sm sm:text-base">
					{#each navItems as item}
						{@render navItem(item)}
					{/each}
				</ul>

				<div class="my-6 px-2">
					<div class="divider my-1 before:bg-[#1e293b] after:bg-[#1e293b]"></div>
				</div>

				<ul class="menu gap-2 p-0 text-sm sm:text-base">
					{#each bottomNavItems as item}
						{@render navItem(item)}
					{/each}
				</ul>
			</nav>

			{#snippet navItem(item: NavItem)}
				{@const isActive = item.href === pathname}
				{@const Icon = item.icon}
				<li>
					{#if item.href}
						<a
							href={item.href}
							onclick={closeDrawerOnMobile}
							class={navItemClasses(isActive)}
							aria-current={isActive ? 'page' : undefined}
						>
							<Icon class="size-5" />
							<span class={['font-medium', drawerOpen ? 'block' : 'hidden', 'lg:block']}>
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
							class={navItemClasses(isActive)}
						>
							<Icon class="size-5" />
							<span class={['font-medium', drawerOpen ? 'block' : 'hidden', 'lg:block']}>
								{item.label}
							</span>
						</button>
					{/if}
				</li>
			{/snippet}

			<!-- Weather Widget -->
			<!-- <div class={['p-3 sm:p-4', drawerOpen ? 'block' : 'hidden', 'lg:block']}>
				<div
					class="card rounded-2xl border border-[#334155] bg-[#101a29] p-4 text-sm text-slate-300"
				>
					<div class="mb-3 flex items-center justify-between">
						<p class="text-xs tracking-[0.35em] text-slate-500 uppercase">Weather</p>
						<CloudSun size={16} class="text-amber-400" />
					</div>
					<div class="flex items-baseline gap-1">
						<span class="text-2xl font-bold text-white">72°</span>
						<span class="text-xs text-slate-500">San Diego</span>
					</div>
				</div>
			</div> -->

			<!-- User Profile / Logout -->
			<div class="border-t border-[#1e293b] p-3 sm:p-4">
				{#if authState.isAuthenticated}
					<a
						href="/dashboard/preferences"
						onclick={closeDrawerOnMobile}
						class={[
							'group flex w-full items-center gap-3 rounded-lg px-4 py-3 text-left transition-colors hover:bg-[#1e293b]',
							drawerOpen ? 'justify-start' : 'justify-center',
							'lg:justify-start'
						]}
					>
						<span class="placeholder avatar">
							<span class="w-9 rounded-full bg-[#1e293b] text-slate-300 group-hover:text-white">
								{#if authState.profile?.picture}
									<img src={authState.profile.picture} alt={authState.profile?.name || ''} />
								{:else}
									<span class="text-xs"
										>{authState.profile?.name
											?.split(' ')
											.map((name) => name[0])
											.join('')}</span
									>
								{/if}
							</span>
						</span>
						<span
							class={[
								'flex flex-1 flex-col overflow-hidden',
								drawerOpen ? 'block' : 'hidden',
								'lg:block'
							]}
						>
							<span class="truncate text-sm font-medium text-white">{authState.profile?.name}</span>
							<span class="text-xs tracking-[0.3em] text-slate-500 uppercase">Account</span>
						</span>
					</a>
				{:else}
					<button
						type="button"
						onclick={async () => {
							if (isNetlifyPreview) {
								window.location.href = `${PRODUCTION_ORIGIN}/auth/proxy-init?origin=${window.location.origin}`;
							} else {
								await logtoClient?.signIn(`${window.location.origin}/auth/callback`);
							}
							closeDrawerOnMobile();
						}}
						class={[
							'group flex w-full items-center gap-3 rounded-lg px-4 py-3 text-left transition-colors hover:bg-[#1e293b]',
							drawerOpen ? 'justify-start' : 'justify-center',
							'lg:justify-start'
						]}
					>
						<LogIn size={20} class="text-slate-400 group-hover:text-white" />
						<span
							class={[
								'font-medium text-slate-400 group-hover:text-white',
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
</div>

<BackupStatusIndicator />

{#if deviceState.migrationState.isOpen}
	<SettingsMigrationWizard
		bind:open={deviceState.migrationState.isOpen}
		deviceId={deviceState.migrationState.targetDeviceId}
		{devices}
	/>
{/if}

<Toast />
<ForceOffroadBanner />
<Toast />
<ForceOffroadBanner />
{#if isIOS}
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
