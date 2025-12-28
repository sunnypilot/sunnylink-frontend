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
				<span class="mr-2 rounded-md bg-[#594AE2] px-2 py-1 font-mono text-xs font-bold text-white">SP</span>
				<span class="font-audiowide text-sm font-semibold tracking-widest text-slate-300 uppercase">sunnylink</span>
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

				<!-- Dashboard Mockup (CSS) -->
				<div class="relative hidden lg:block" in:fly={{ y: 50, duration: 1000, delay: 400 }}>
					<!-- Floating animation container -->
					<div class="relative animate-[float_6s_ease-in-out_infinite] rounded-2xl border border-white/10 bg-[#162032] p-2 shadow-2xl backdrop-blur-xl">
						<div class="absolute inset-0 -z-10 rounded-2xl bg-gradient-to-tr from-[#594AE2]/20 to-blue-500/20 blur-xl"></div>
						
						<!-- Header -->
						<div class="mb-4 flex items-center justify-between rounded-t-xl bg-[#0f1726]/50 px-4 py-3 border-b border-white/5">
							<div class="flex gap-2">
								<div class="h-3 w-3 rounded-full bg-red-500/20 text-red-500 flex items-center justify-center"><div class="h-1.5 w-1.5 rounded-full bg-current"></div></div>
								<div class="h-3 w-3 rounded-full bg-amber-500/20 text-amber-500 flex items-center justify-center"><div class="h-1.5 w-1.5 rounded-full bg-current"></div></div>
								<div class="h-3 w-3 rounded-full bg-emerald-500/20 text-emerald-500 flex items-center justify-center"><div class="h-1.5 w-1.5 rounded-full bg-current"></div></div>
							</div>
							<div class="h-2 w-32 rounded-full bg-white/10"></div>
						</div>

						<!-- Main Content Grid -->
						<div class="grid grid-cols-12 gap-4 px-4 pb-4">
							<!-- Sidebar -->
							<div class="col-span-3 space-y-3">
								<div class="h-10 rounded-lg bg-[#594AE2]/20 border border-[#594AE2]/30"></div>
								<div class="h-10 rounded-lg bg-white/5"></div>
								<div class="h-10 rounded-lg bg-white/5"></div>
								<div class="mt-8 h-32 rounded-lg bg-white/5 p-3 space-y-2">
									<div class="h-2 w-16 bg-white/10 rounded"></div>
									<div class="h-2 w-24 bg-white/10 rounded"></div>
									<div class="h-12 w-full bg-[#594AE2]/10 rounded mt-2 relative overflow-hidden">
										<div class="absolute inset-x-0 bottom-0 h-8 bg-[#594AE2]/20 rounded-b"></div>
									</div>
								</div>
							</div>

							<!-- Main Map Area -->
							<div class="col-span-9 space-y-4">
								<div class="relative aspect-video rounded-xl bg-[#0a0f18] border border-white/5 overflow-hidden">
									<!-- Imitate Map -->
									<div class="absolute inset-0 bg-[radial-gradient(ellipse_at_center,_var(--tw-gradient-stops))] from-slate-800/50 via-slate-900 to-slate-950"></div>
									<div class="absolute top-1/2 left-1/2 h-4 w-4 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white bg-[#594AE2] shadow-[0_0_20px_#594AE2]"></div>
									<!-- Map paths -->
									<svg class="absolute inset-0 h-full w-full opacity-30" viewBox="0 0 100 100" preserveAspectRatio="none">
										<path d="M0 50 Q 25 40 50 50 T 100 50" stroke="#594AE2" stroke-width="0.5" fill="none" />
									</svg>
									
									<!-- Quick Stats Overlay -->
									<div class="absolute top-4 right-4 flex gap-2">
										<div class="rounded-lg bg-black/40 backdrop-blur px-3 py-1.5 border border-white/10">
											<div class="text-[0.6rem] text-slate-400">STATUS</div>
											<div class="text-xs font-bold text-emerald-400">ONLINE</div>
										</div>
									</div>
								</div>

								<!-- Bottom Stats -->
								<div class="grid grid-cols-3 gap-4">
									<div class="rounded-xl bg-white/5 p-3 border border-white/5">
										<div class="mb-1 text-[10px] text-slate-400">STORAGE</div>
										<div class="h-1.5 w-full rounded-full bg-white/10 mb-1">
											<div class="h-full w-[65%] rounded-full bg-blue-500"></div>
										</div>
									</div>
									<div class="rounded-xl bg-white/5 p-3 border border-white/5">
										<div class="mb-1 text-[10px] text-slate-400">TEMP</div>
										<div class="text-sm font-mono text-white">42°C</div>
									</div>
									<div class="rounded-xl bg-white/5 p-3 border border-white/5">
										<div class="mb-1 text-[10px] text-slate-400">UPTIME</div>
										<div class="text-sm font-mono text-white">12d 4h</div>
									</div>
								</div>
							</div>
						</div>
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
				<p class="mt-4 text-lg text-slate-400">Advanced features designed for enthusiasts and fleet managers alike.</p>
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

				<!-- Step 1 -->
				<div class="relative flex flex-col items-center text-center">
					<div class="relative mb-6 z-10 flex h-24 w-24 items-center justify-center rounded-full border border-[#594AE2]/30 bg-[#0f1726] shadow-lg shadow-[#594AE2]/20">
						<Download class="h-10 w-10 text-[#594AE2]" />
					</div>
					<h3 class="text-xl font-semibold text-white">1. Install sunnypilot</h3>
					<p class="mt-2 text-slate-400">Flash sunnypilot to your device to unlock sunnylink capabilities.</p>
				</div>

				<!-- Step 2 -->
				<div class="relative flex flex-col items-center text-center">
					<div class="relative mb-6 z-10 flex h-24 w-24 items-center justify-center rounded-full border border-blue-500/30 bg-[#0f1726] shadow-lg shadow-blue-500/20">
						<LinkIcon class="h-10 w-10 text-blue-500" />
					</div>
					<h3 class="text-xl font-semibold text-white">2. Pair via sunnylink</h3>
					<p class="mt-2 text-slate-400">Scan the QR code on your device to instantly pair with your account.</p>
				</div>

				<!-- Step 3 -->
				<div class="relative flex flex-col items-center text-center">
					<div class="relative mb-6 z-10 flex h-24 w-24 items-center justify-center rounded-full border border-emerald-500/30 bg-[#0f1726] shadow-lg shadow-emerald-500/20">
						<Car class="h-10 w-10 text-emerald-500" />
					</div>
					<h3 class="text-xl font-semibold text-white">3. Manage & Drive</h3>
					<p class="mt-2 text-slate-400">View stats, change settings securely, and enjoy your drive.</p>
				</div>
			</div>
		</div>
	</section>

	<!-- Footer -->
	<footer class="border-t border-white/5 bg-[#0f1726] py-12">
		<div class="mx-auto max-w-7xl px-6 lg:px-8">
			<div class="flex flex-col items-center justify-between gap-8 md:flex-row">
				<div class="flex items-center gap-2">
					<div class="rounded-md bg-[#594AE2] px-2 py-1 font-mono text-xs font-bold text-white">SP</div>
					<span class="font-semibold text-white">sunnylink</span>
				</div>
				<div class="flex gap-8 text-sm text-slate-400">
					<a href="/terms" class="hover:text-white transition-colors">Terms</a>
					<a href="/privacy" class="hover:text-white transition-colors">Privacy</a>
					<a href="https://github.com/sunnypilot/sunnylink" target="_blank" class="hover:text-white transition-colors flex items-center gap-2">
						<Github size={16} /> GitHub
					</a>
				</div>
				<div class="text-sm text-slate-500">
					© {new Date().getFullYear()} sunnylink. All rights reserved.
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
