<script lang="ts">
	import '../app.css';
	import favicon from '$lib/assets/favicon.svg';
	import { page } from '$app/stores';

	let { children } = $props();
	export const ssr = false;

	const navGroups = [
		{
			title: 'Workspace',
			items: [
				{ icon: '🏠', label: 'Overview', href: '/dashboard' },
				{ icon: '🗺️', label: 'Routes', href: '/dashboard/routes' },
				{ icon: '💾', label: 'Backups', href: '/dashboard/backups' }
			]
		},
		{
			title: 'On-Device Settings',
			items: [
				{ icon: '⚙️', label: 'Device Settings', href: '/settings/general' },
				{ icon: '🎛️', label: 'Toggles', href: '/settings/network' },
				{ icon: '🛞', label: 'Steering', href: '/settings/driving' },
				{ icon: '💨', label: 'Cruise', href: '/settings/privacy' },
				{ icon: '🎨', label: 'Visuals', href: '/settings/developer' },
				{ icon: '🔧', label: 'Developer', href: '/settings/developer' }
			]
		}
	];

	const supportLink = { icon: '❔', label: 'Help & Support', href: '/support' };

	let collapsed = $state(false);
	const currentPath = $derived($page.url.pathname);
	const isActive = (href: string) => currentPath === href || currentPath.startsWith(`${href}/`);
	const toggleSidebar = () => {
		collapsed = !collapsed;
	};
</script>

<svelte:head>
	<link rel="icon" href={favicon} />
</svelte:head>

<div
	class="relative flex min-h-screen overflow-hidden bg-gradient-to-br from-[#05070d] via-[#0a1120] to-[#0a1323] text-slate-100"
>
	<div
		class="pointer-events-none absolute inset-y-[-25%] right-[-20%] h-[150%] w-[55%] rounded-full bg-[#16233b]/35 blur-[180px]"
	/>
	<div
		class="pointer-events-none absolute inset-y-[35%] left-[-25%] h-[120%] w-[50%] rounded-full bg-[#0d1a2d]/35 blur-[160px]"
	/>
	<aside
		class={`relative z-20 flex flex-col border-r border-white/5 bg-white/6 backdrop-blur-xl transition-[width] duration-300 ${
			collapsed ? 'w-20 px-2' : 'w-72 px-5'
		}`}
	>
		<div class={`flex items-center ${collapsed ? 'justify-center' : 'justify-between'} pt-6`}>
			{#if !collapsed}
				<div class="flex items-center gap-3">
					<span class="grid size-10 place-content-center rounded-2xl bg-white/10 text-lg text-white"
						>🌤️</span
					>
					<div>
						<p class="text-xs tracking-[0.35em] text-slate-300/70 uppercase">sunnylink</p>
						<h1 class="text-base font-semibold text-white">Control Center</h1>
					</div>
				</div>
			{/if}

			<button
				class={`rounded-2xl border border-white/10 bg-white/5 p-3 text-slate-200 transition hover:bg-white/12 ${
					collapsed ? '' : 'ml-auto'
				}`}
				type="button"
				on:click={toggleSidebar}
				aria-label="Toggle sidebar"
			>
				<span class="text-lg leading-none">{collapsed ? '›' : '‹'}</span>
			</button>
		</div>

		<nav class="mt-8 flex-1 space-y-6">
			{#each navGroups as group}
				<div class="space-y-2">
					{#if collapsed}
						<div class="mx-auto h-px w-8 rounded-full bg-white/10" />
					{:else}
						<p class="px-2 text-xs font-semibold tracking-[0.28em] text-slate-400/80 uppercase">
							{group.title}
						</p>
					{/if}

					<div class="space-y-1.5">
						{#each group.items as item}
							<a
								class={`group relative flex ${collapsed ? 'justify-center' : 'items-center gap-3'} rounded-3xl px-2 ${
									collapsed ? 'py-1.5' : 'py-2.5'
								} text-sm font-medium transition`}
								class:text-white={isActive(item.href)}
								href={item.href}
								title={item.label}
							>
								<span
									class={`grid size-12 place-content-center rounded-[22px] bg-white/12 text-base text-white/90 shadow-[0_0_0_0_rgba(255,255,255,0)] transition ${
										isActive(item.href)
											? 'bg-white/20 text-white shadow-[0_0_0_6px_rgba(255,255,255,0.06)]'
											: 'group-hover:text-white/100'
									}`}
								>
									{item.icon}
								</span>
								{#if !collapsed}
									<span class="truncate text-slate-300 group-hover:text-white">{item.label}</span>
								{/if}
							</a>
						{/each}
					</div>
				</div>
			{/each}
		</nav>

		<footer class={`pb-6 ${collapsed ? 'pt-2' : 'pt-3'}`}>
			<a
				class={`relative flex ${collapsed ? 'justify-center' : 'items-center gap-3'} rounded-3xl border border-white/10 bg-white/6 px-2 ${
					collapsed ? 'py-2' : 'py-2'
				} text-sm font-medium text-slate-200 transition hover:bg-white/12`}
				href={supportLink.href}
				title={supportLink.label}
			>
				<span
					class="grid size-12 place-content-center rounded-[22px] bg-white/10 text-base text-white"
				>
					{supportLink.icon}
				</span>
				{#if !collapsed}
					<span class="truncate">{supportLink.label}</span>
				{/if}
			</a>
		</footer>
	</aside>

	<main class="relative z-10 flex flex-1 flex-col overflow-y-auto">
		<section class="relative flex-1 px-10 py-14 lg:px-16">
			{@render children()}
		</section>
	</main>
</div>
