<script lang="ts">
	import '../app.css';
	import favicon from '$lib/assets/favicon.svg';
	import { page } from '$app/state';
	import {
		House,
		Map,
		HardDrive,
		Settings,
		ToggleLeft,
		Gauge,
		Wind,
		Palette,
		Wrench,
		LifeBuoy,
		LogOut,
		Menu,
		CloudSun
	} from '@lucide/svelte';
	import type { Component } from 'svelte';
	import { authState, logtoClient } from '$lib/logto/auth.svelte';

	let { children } = $props();
	type NavItem = { icon: Component; label: string; href: string };

	let drawerOpen = $state(true);
	let currentPath = $derived(page.url.pathname.split('/')[1]);

	const handleLogout = async () => {
		await logtoClient?.signOut('http://localhost:5173/');
	};

	const navItems = [
		{ icon: House, label: 'Overview', href: '/dashboard' },
		{ icon: Map, label: 'Routes', href: '/dashboard/routes' },
		{ icon: HardDrive, label: 'Backups', href: '/dashboard/backups' },
		{ icon: Settings, label: 'Device Settings', href: '/settings/general' },
		{ icon: ToggleLeft, label: 'Toggles', href: '/settings/network' },
		{ icon: Gauge, label: 'Steering', href: '/settings/driving' },
		{ icon: Wind, label: 'Cruise', href: '/settings/privacy' },
		{ icon: Palette, label: 'Visuals', href: '/settings/developer' },
		{ icon: Wrench, label: 'Developer', href: '/settings/developer' }
	];

	const bottomNavItems = [
		{ icon: LifeBuoy, label: 'Support', href: '/support' },
		{ icon: LogOut, label: 'Logout', href: '#' } // Logout handled by button
	];
</script>

<svelte:head>
	<link rel="icon" href={favicon} />
</svelte:head>

<div class="drawer lg:drawer-open">
	<input id="main-drawer" type="checkbox" class="drawer-toggle" bind:checked={drawerOpen} />
	<div class="drawer-content flex flex-col bg-[#0f1726]">
		<!-- Navbar for mobile -->
		<div class="navbar w-full lg:hidden">
			<div class="flex-none">
				<label
					for="main-drawer"
					aria-label="open sidebar"
					class="btn btn-square text-white btn-ghost"
				>
					<Menu size={24} />
				</label>
			</div>
			<div class="mx-2 flex-1 px-2 font-bold text-white">sunnypilot</div>
		</div>

		<!-- Page content -->
		<main class="flex-1 overflow-y-auto p-4 lg:p-8">
			{@render children()}
		</main>
	</div>

	<div class="drawer-side z-20">
		<label for="main-drawer" aria-label="close sidebar" class="drawer-overlay"></label>
		<aside
			class={[
				'flex min-h-full flex-col border-r border-[#1e293b] bg-[#0f1726] transition-[width] duration-300',
				drawerOpen ? 'w-80' : 'w-20'
			]}
		>
			<!-- Logo Area -->
			<div class="flex h-20 items-center gap-4 px-6">
				<div
					class="badge h-8 w-8 rounded-md border-[#334155] p-0 font-mono text-[0.6rem] tracking-widest text-white badge-neutral"
				>
					SP
				</div>
				{#if drawerOpen}
					<h1 class="text-base font-semibold text-slate-200">Control Center</h1>
				{/if}
			</div>

			<!-- Navigation -->
			<nav class="flex-1 px-4 py-6">
				<ul class="menu gap-2 p-0 text-base">
					{#each navItems as item}
						{@render navItem(item)}
					{/each}
				</ul>

				<div class="my-6 px-2">
					<div class="divider my-1 before:bg-[#1e293b] after:bg-[#1e293b]"></div>
				</div>

				<ul class="menu gap-2 p-0 text-base">
					{#each bottomNavItems as item}
						{@render navItem(item)}
					{/each}
				</ul>
			</nav>

			{#snippet navItem(item: NavItem)}
				<li>
					<a
						href={item.href}
						class={[
							'flex items-center gap-3 rounded-lg px-4 py-3 transition-all duration-200',
							currentPath === item.href
								? 'active border-[#334155] bg-[#1e293b] text-white'
								: 'border-transparent text-slate-400 hover:border-[#1e293b] hover:bg-[#1e293b] hover:text-white',
							!drawerOpen && 'justify-center px-2'
						]}
					>
						<item.icon size={20} />
						{#if drawerOpen}
							<span class="font-medium">{item.label}</span>
						{/if}
					</a>
				</li>
			{/snippet}

			<!-- Weather Widget (Only visible when open) -->
			{#if drawerOpen}
				<div class="p-4">
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
			{/if}

			<!-- User Profile / Logout -->
			<div class="border-t border-[#1e293b] p-4">
				<button
					onclick={handleLogout}
					class="group flex w-full items-center gap-3 rounded-lg px-4 py-3 text-left transition-colors hover:bg-[#1e293b]"
					class:justify-center={!drawerOpen}
				>
					<div class="placeholder avatar">
						<div class="w-8 rounded-full bg-[#1e293b] text-slate-300 group-hover:text-white">
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
						</div>
					</div>
					{#if drawerOpen}
						<div class="flex flex-1 flex-col overflow-hidden">
							<span class="truncate text-sm font-medium text-white">{authState.profile?.name}</span>
						</div>
						<LogOut size={18} class="text-slate-500 transition-colors group-hover:text-white" />
					{/if}
				</button>
			</div>
		</aside>
	</div>
</div>
