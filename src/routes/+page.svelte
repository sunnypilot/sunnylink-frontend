<script lang="ts">
	import { logtoClient, authState } from '$lib/logto/auth.svelte';
	import { browser } from '$app/environment';
	import { goto } from '$app/navigation';
	import {
		ArrowRight,
		Shield,
		Globe,
		Smartphone,
		Zap,
		Activity,
		Download,
		Link as LinkIcon,
		Car,
		Github,
		Twitter,
		Menu,
		X
	} from 'lucide-svelte';
	import { onMount } from 'svelte';
	import { fade, fly } from 'svelte/transition';
	import { quintOut } from 'svelte/easing';



	let isMenuOpen = false;

	const handleMainAction = async () => {
		if (authState.isAuthenticated) {
			goto('/dashboard');
		} else {
			if (!browser || !logtoClient) return;
			await logtoClient.signIn(`${window.location.origin}/auth/callback`);
		}
	};
	
	function blurfade(node: Element, { duration = 800 }: { duration?: number }) {
		return {
			duration,
			css: (t: number) => {
				const eased = quintOut(t);
				return `
					opacity: ${eased};
					filter: blur(${(1 - eased) * 10}px);
				`;
			}
		};
	}
</script>

<div class="min-h-screen bg-[#0f1726] text-white selection:bg-[#594AE2]/30 font-sans overflow-x-hidden">
	<!-- Navbar -->
	<nav class="fixed top-0 z-50 w-full border-b border-white/5 bg-[#0f1726]/80 backdrop-blur-md">
		<div class="mx-auto flex max-w-7xl items-center justify-between px-6 py-4 lg:px-8">
			<div class="flex items-center gap-2">
				<span class="font-audiowide text-xl font-semibold tracking-widest text-slate-300">sunnylink</span>
			</div>
			
			<!-- Mobile Menu Button -->
			<button class="lg:hidden text-slate-400 hover:text-white" onclick={() => isMenuOpen = !isMenuOpen}>
				{#if isMenuOpen}
					<X size={24} />
				{:else}
					<Menu size={24} />
				{/if}
			</button>

			<div class="hidden gap-8 lg:flex items-center">
				<a href="#features" class="text-sm font-medium text-slate-400 transition-colors hover:text-white">Features</a>
				<a href="#how-it-works" class="text-sm font-medium text-slate-400 transition-colors hover:text-white">How it Works</a>
				<a href="https://community.sunnypilot.ai" target="_blank" class="text-sm font-medium text-slate-400 transition-colors hover:text-white">Community</a>
				<button
					onclick={handleMainAction}
					class="rounded-full bg-[#594AE2] px-4 py-2 text-sm font-semibold text-white transition-all hover:bg-[#4839cf] hover:shadow-[0_0_20px_-5px_#594AE2]"
				>
					{authState.isAuthenticated ? 'Dashboard' : 'Sign In'}
				</button>
			</div>
		</div>

		<!-- Mobile Menu -->
		{#if isMenuOpen}
			<div class="lg:hidden px-6 py-4 border-t border-white/5 bg-[#0f1726]" transition:fly={{ y: -20, duration: 300 }}>
				<div class="flex flex-col gap-4">
					<a href="#features" class="text-sm font-medium text-slate-400 hover:text-white" onclick={() => isMenuOpen = false}>Features</a>
					<a href="#how-it-works" class="text-sm font-medium text-slate-400 hover:text-white" onclick={() => isMenuOpen = false}>How it Works</a>
					<a href="https://community.sunnypilot.ai" target="_blank" class="text-sm font-medium text-slate-400 hover:text-white" onclick={() => isMenuOpen = false}>Community</a>
					<button
						onclick={handleMainAction}
						class="w-full rounded-full bg-[#594AE2] px-4 py-2 text-sm font-semibold text-white"
					>
						{authState.isAuthenticated ? 'Dashboard' : 'Sign In'}
					</button>
				</div>
			</div>
		{/if}
	</nav>

	<!-- Hero Section -->
	<section class="relative pt-32 pb-20 lg:pt-48 lg:pb-32">
		<!-- Background Gradients -->
		<div class="absolute top-0 left-1/2 -z-10 h-[800px] w-[800px] -translate-x-1/2 rounded-full bg-[#594AE2]/10 blur-[120px]"></div>
		<div class="absolute bottom-0 right-0 -z-10 h-96 w-96 rounded-full bg-blue-600/10 blur-[100px]"></div>

		<div class="mx-auto max-w-7xl px-6 lg:px-8">
			<div class="grid gap-16 lg:grid-cols-2 lg:items-center">
				<div in:fade={{ duration: 800, delay: 200 }}>
					<div class="mb-6 inline-flex rounded-full border border-[#594AE2]/30 bg-[#594AE2]/10 px-3 py-1 text-sm text-[#7f71ff] ring-1 ring-white/10">
						Now available for sunnypilot
					</div>
					<h1 class="text-4xl font-bold tracking-tight text-white mb-6 sm:text-6xl lg:leading-tight">
						Manage Your comma Device From <span class="bg-gradient-to-r from-[#594AE2] to-blue-500 bg-clip-text text-transparent">Anywhere</span>
					</h1>
					<p class="mb-8 text-lg leading-relaxed text-slate-400">
						Secure, remote access to your comma device, Powered by sunnypilot. View status, change settings, and manage your fleet with a premium, real-time dashboard.
					</p>
					<div class="flex flex-col gap-4 sm:flex-row">
						<button
							onclick={handleMainAction}
							class="group flex items-center justify-center gap-2 rounded-xl bg-[#594AE2] px-8 py-4 text-base font-semibold text-white shadow-lg shadow-[#594AE2]/20 transition-all hover:-translate-y-1 hover:bg-[#4839cf] hover:shadow-xl hover:shadow-[#594AE2]/30"
						>
							{authState.isAuthenticated ? 'Go to sunnylink Dashboard' : 'Sign in via sunnylink'}
							<ArrowRight class="h-5 w-5 transition-transform group-hover:translate-x-1" />
						</button>
						<a
							href="https://community.sunnypilot.ai"
							target="_blank"
							class="flex items-center justify-center gap-2 rounded-xl border border-white/10 bg-white/5 px-8 py-4 text-base font-semibold text-white transition-all hover:bg-white/10 hover:border-white/20"
						>
							Join the Community
						</a>
					</div>
				</div>

				<!-- Landing Dashboard (Image) -->
				<div class="relative hidden lg:block" in:fly={{ y: 50, duration: 1000, delay: 400 }}>
					<!-- Floating animation container -->
					<div class="relative animate-[float_6s_ease-in-out_infinite] rounded-xl bg-[#162032] p-2 shadow-2xl backdrop-blur-xl border border-white/10">
						<div class="absolute inset-0 -z-10 rounded-xl bg-gradient-to-tr from-[#594AE2]/20 to-blue-500/20 blur-xl"></div>
						
						<img 
							src="/landing-dashboard.png"
							alt="Sunnylink Dashboard Interface" 
							class="w-full rounded-lg shadow-inner"
						/>
					</div>
				</div>
			</div>
		</div>
	</section>

	<!-- Features Section -->
	<section id="features" class="py-24 relative overflow-hidden">
		<div class="mx-auto max-w-7xl px-6 lg:px-8">
			<div class="mx-auto max-w-2xl text-center mb-16">
				<h2 class="text-3xl font-bold tracking-tight text-white sm:text-4xl">Everything you need to manage your device</h2>
				<p class="mt-4 text-lg text-slate-400">Essential tools for every user. Simplify device management, whether you're a daily driver or an advanced user.</p>
			</div>

			<div class="grid grid-cols-1 gap-8 md:grid-cols-3">
				<!-- Card 1 -->
				<div class="group relative overflow-hidden rounded-2xl border border-white/10 bg-[#162032] p-8 transition-all hover:bg-[#1c2942] hover:shadow-2xl hover:shadow-[#594AE2]/10 hover:-translate-y-1">
					<div class="absolute top-0 right-0 -m-4 h-32 w-32 rounded-full bg-[#594AE2]/5 blur-2xl transition-all group-hover:bg-[#594AE2]/10"></div>
					<div class="mb-6 inline-flex rounded-xl bg-[#594AE2]/10 p-3 text-[#594AE2]">
						<Globe class="h-6 w-6" />
					</div>
					<h3 class="mb-3 text-xl font-semibold text-white">Secured Remote Access</h3>
					<p class="text-slate-400 leading-relaxed">
						Access your comma device from anywhere. No complex network setup, VPNs, or port forwarding required.
					</p>
				</div>

				<!-- Card 2 -->
				<div class="group relative overflow-hidden rounded-2xl border border-white/10 bg-[#162032] p-8 transition-all hover:bg-[#1c2942] hover:shadow-2xl hover:shadow-[#594AE2]/10 hover:-translate-y-1">
					<div class="absolute top-0 right-0 -m-4 h-32 w-32 rounded-full bg-blue-500/5 blur-2xl transition-all group-hover:bg-blue-500/10"></div>
					<div class="mb-6 inline-flex rounded-xl bg-blue-500/10 p-3 text-blue-500">
						<Activity class="h-6 w-6" />
					</div>
					<h3 class="mb-3 text-xl font-semibold text-white">Real-time Control</h3>
					<p class="text-slate-400 leading-relaxed">
						Toggle settings, check device power status, reboot remotely, and monitor health metrics in real-time.
					</p>
				</div>

				<!-- Card 3 -->
				<div class="group relative overflow-hidden rounded-2xl border border-white/10 bg-[#162032] p-8 transition-all hover:bg-[#1c2942] hover:shadow-2xl hover:shadow-[#594AE2]/10 hover:-translate-y-1">
					<div class="absolute top-0 right-0 -m-4 h-32 w-32 rounded-full bg-emerald-500/5 blur-2xl transition-all group-hover:bg-emerald-500/10"></div>
					<div class="mb-6 inline-flex rounded-xl bg-emerald-500/10 p-3 text-emerald-500">
						<Shield class="h-6 w-6" />
					</div>
					<h3 class="mb-3 text-xl font-semibold text-white">Secure & Private</h3>
					<p class="text-slate-400 leading-relaxed">
						Built with security first. Your data stays private, encrypted, and yours. Zero configuration required.
					</p>
				</div>
			</div>
		</div>
	</section>

	<!-- How It Works -->
	<section id="how-it-works" class="py-24 bg-[#0A0F1A]">
		<div class="mx-auto max-w-7xl px-6 lg:px-8">
			<div class="mb-16 md:text-center">
				<h2 class="text-3xl font-bold tracking-tight text-white sm:text-4xl">Get started in minutes</h2>
				<p class="mt-4 text-lg text-slate-400">Three simple steps to take full control of your device.</p>
			</div>
			
			<div class="relative grid gap-12 lg:grid-cols-3">
				<!-- Connecting Line (Desktop) -->
				<div class="hidden lg:block absolute top-12 left-[16%] right-[16%] h-0.5 bg-gradient-to-r from-[#594AE2]/0 via-[#594AE2]/30 to-[#594AE2]/0 border-t border-dashed border-white/20"></div>

				{#each [
					{
						title: '1. Install sunnypilot',
						description: 'Install sunnypilot to your comma device to unlock its potential with sunnylink.',
						icon: Download,
						color: 'text-[#594AE2]',
						borderColor: 'border-[#594AE2]/30',
						shadowColor: 'shadow-[#594AE2]/20',
						hoverBorder: 'group-hover:border-[#594AE2]/50',
						hoverShadow: 'group-hover:shadow-[0_0_30px_-5px_#594AE2]',
						hoverText: 'group-hover:text-[#594AE2]',
						link: 'https://community.sunnypilot.ai/t/recommended-branch-installations/235',
						target: '_blank'
					},
					{
						title: '2. Pair via sunnylink',
						description: 'Scan the QR code on your comma device to pair with your account.',
						icon: LinkIcon,
						color: 'text-blue-500',
						borderColor: 'border-blue-500/30',
						shadowColor: 'shadow-blue-500/20',
						hoverBorder: 'group-hover:border-blue-500/50',
						hoverShadow: 'group-hover:shadow-[0_0_30px_-5px_#3b82f6]',
						hoverText: 'group-hover:text-blue-500',
						link: null 
					},
					{
						title: '3. Manage & Drive',
						description: 'Change settings securely, view stats, and enjoy your drive.',
						icon: Car,
						color: 'text-emerald-500',
						borderColor: 'border-emerald-500/30',
						shadowColor: 'shadow-emerald-500/20',
						hoverBorder: 'group-hover:border-emerald-500/50',
						hoverShadow: 'group-hover:shadow-[0_0_30px_-5px_#10b981]',
						hoverText: 'group-hover:text-emerald-500',
						link: '/dashboard'
					}
				] as step}
					<svelte:element 
						this={step.link ? 'a' : 'div'} 
						href={step.link}
						target={step.target}
						class="group relative flex flex-col items-center text-center transition-transform hover:-translate-y-1 {step.link ? 'cursor-pointer' : ''}"
					>
						<div 
							class="relative mb-6 z-10 flex h-24 w-24 items-center justify-center rounded-full border bg-[#0f1726] shadow-lg transition-all {step.borderColor} {step.shadowColor} {step.hoverShadow} {step.hoverBorder}"
						>
							<svelte:component this={step.icon} class="h-10 w-10 {step.color}" />
						</div>
						<h3 
							class="text-xl font-semibold text-white transition-colors {step.hoverText}"
						>
							{step.title}
						</h3>
						<p class="mt-2 text-slate-400">{step.description}</p>
					</svelte:element>
				{/each}
			</div>
		</div>
	</section>

	<!-- Footer -->
	<footer class="border-t border-white/5 bg-[#0f1726] py-12">
		<div class="mx-auto max-w-7xl px-6 lg:px-8">
			<div class="flex flex-col items-center justify-between gap-8 md:flex-row">
				<div class="flex items-center gap-2">
					<span class="font-audiowide font-semibold text-white">sunnylink</span>
				</div>
				<div class="flex gap-8 text-sm text-slate-400">
					<a href="https://www.sunnypilot.ai/terms" target="_blank" class="hover:text-white transition-colors">Terms of Service</a>
					<a href="https://www.sunnypilot.ai/privacy" target="_blank" class="hover:text-white transition-colors">Privacy Policy</a>
					<a href="https://github.com/sunnypilot/sunnylink-frontend" target="_blank" class="hover:text-white transition-colors flex items-center gap-2">
						<Github size={16} /> GitHub
					</a>
				</div>
				<div class="text-sm text-slate-500">
					© {new Date().getFullYear()} sunnypilot. All rights reserved.
				</div>
			</div>
		</div>
	</footer>
</div>


<style>
	:global(html) {
		overflow-y: auto !important;
	}
</style>
