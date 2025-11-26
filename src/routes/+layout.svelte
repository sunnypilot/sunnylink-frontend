<script lang="ts">
	import '../app.css';
	import favicon from '$lib/assets/favicon.svg';
	import { page } from '$app/state';

	import { authState, logtoClient } from '$lib/logto/auth.svelte';
	import { deviceState } from '$lib/stores/device.svelte';
	import {
		CloudSun,
		Gauge,
		HardDrive,
		House,
		LifeBuoy,
		LogOut,
		Map as MapIcon,
		Menu,
		Palette,
		Settings,
		ToggleLeft,
		Wind,
		Wrench
	} from 'lucide-svelte';

	let { children, data } = $props();
	type NavItem = { icon: any; label: string; href?: string; action?: () => void };

	let drawerOpen = $state(false);
	const pathname = $derived(page.url.pathname);

	const handleLogout = async () => {
		await logtoClient?.signOut('http://localhost:5173/');
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

	const navItems = [
		{ icon: House, label: 'Overview', href: '/dashboard' },
		{ icon: MapIcon, label: 'Routes', href: '/dashboard/routes' },
		{ icon: HardDrive, label: 'Backups', href: '/dashboard/settings/backups' },
		{ icon: Settings, label: 'Device Settings', href: '/dashboard/settings/device' },
		{ icon: ToggleLeft, label: 'Toggles', href: '/dashboard/settings/toggles' },
		{ icon: Gauge, label: 'Steering', href: '/dashboard/settings/steering' },
		{ icon: Wind, label: 'Cruise', href: '/dashboard/settings/cruise' },
		{ icon: Palette, label: 'Visuals', href: '/dashboard/settings/visuals' },
		{ icon: Wrench, label: 'Developer', href: '/dashboard/settings/developer' },
		{ icon: Settings, label: 'Other', href: '/dashboard/settings/other' }
	];

	const bottomNavItems = [
		{ icon: LifeBuoy, label: 'Support', href: '/support' },
		{ icon: LogOut, label: 'Logout', action: handleLogout }
	];

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
		data.streamed.devices.then((devices) => {
			if (devices && devices.length > 0) {
				checkAllDevicesStatus(devices);
			}
		});
	});
</script>

<svelte:head>
	<link rel="icon" href={favicon} />
</svelte:head>

<div class="drawer min-h-screen bg-[#0f1726] lg:drawer-open">
	<input id="main-drawer" type="checkbox" class="drawer-toggle" bind:checked={drawerOpen} />
	<div class="drawer-content flex min-h-screen flex-col bg-[#0f1726]">
		<!-- Navbar for mobile -->
		<header class="w-full border-b border-[#1e293b] bg-[#0f1726] px-4 py-3 sm:px-6">
			<div class="flex items-center justify-between gap-3">
				<div class="flex items-center gap-3 lg:hidden">
					<label
						for="main-drawer"
						aria-label="open sidebar"
						class="btn btn-square text-white btn-ghost"
					>
						<Menu size={22} />
					</label>
					<p class="text-sm font-semibold tracking-[0.35em] text-slate-300 uppercase">sunnypilot</p>
				</div>

				<!-- Device Selector -->
				<div class="flex flex-1 justify-end lg:w-full lg:justify-between">
					<div class="hidden lg:block">
						<!-- Breadcrumbs or Title could go here -->
					</div>

					{#await data.streamed.devices}
						<div class="h-10 w-48 animate-pulse rounded-lg bg-[#1e293b]"></div>
					{:then devices}
						{#if devices && devices.length > 0}
							<DeviceSelector {devices} />
						{:else}
							<span class="text-sm text-slate-400">No devices found</span>
						{/if}
					{/await}
				</div>
			</div>
		</header>

		<!-- Page content -->
		<main class="flex-1 overflow-y-auto px-4 py-6 sm:px-6 lg:px-10 lg:py-10">
			{@render children()}
		</main>
	</div>

	<div class="drawer-side z-20">
		<label for="main-drawer" aria-label="close sidebar" class="drawer-overlay"></label>
		<aside
			class={[
				'flex min-h-full flex-col border-r border-[#1e293b] bg-[#0f1726] transition-[width] duration-300',
				drawerOpen ? 'w-64 sm:w-72' : 'w-16 sm:w-20',
				'lg:w-80 lg:min-w-[20rem]'
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
					<p class="text-[0.65rem] tracking-[0.35em] text-slate-500 uppercase">Sunnylink</p>
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
			<div class={['p-3 sm:p-4', drawerOpen ? 'block' : 'hidden', 'lg:block']}>
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
			</div>

			<!-- User Profile / Logout -->
			<div class="border-t border-[#1e293b] p-3 sm:p-4">
				<button
					type="button"
					onclick={() => {
						handleLogout();
						closeDrawerOnMobile();
					}}
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
					<LogOut size={18}></LogOut>
				</button>
			</div>
		</aside>
	</div>
</div>
