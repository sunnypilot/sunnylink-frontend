<script lang="ts">
	import { logtoClient, authState } from '$lib/logto/auth.svelte';
	import { browser } from '$app/environment';
	import { goto } from '$app/navigation';
	import { ArrowRight, Shield, Globe, Smartphone } from 'lucide-svelte';
	import { get } from 'svelte/store';

	export const ssr = false;

	const handleMainAction = async () => {
		if (get(authState).isAuthenticated) {
			goto('/dashboard');
		} else {
			if (!browser || !logtoClient) return;
			await logtoClient.signIn(`${window.location.origin}/auth/callback`);
		}
	};
</script>

<div class="min-h-screen bg-[#0f1726] text-white selection:bg-indigo-500/30">
	<!-- Hero Section -->
	<div class="relative overflow-hidden">
		<!-- Background Gradients -->
		<div
			class="absolute -top-40 -left-40 h-96 w-96 rounded-full bg-indigo-500/20 blur-[100px]"
		></div>
		<div class="absolute top-20 right-0 h-96 w-96 rounded-full bg-purple-500/10 blur-[100px]"></div>

		<div class="relative mx-auto max-w-7xl px-6 pt-20 pb-24 sm:pb-32 lg:px-8 lg:pt-32">
			<div class="mx-auto max-w-2xl text-center">
				<div class="mb-8 flex justify-center">
					<div
						class="rounded-full border border-indigo-500/30 bg-indigo-500/10 px-3 py-1 text-sm leading-6 text-indigo-400 ring-1 ring-white/10 hover:ring-white/20"
					>
						Now available for sunnypilot devices
					</div>
				</div>
				<h1 class="text-4xl font-bold tracking-tight text-white sm:text-6xl">
					Control Your Comma Device From Anywhere
				</h1>
				<p class="mt-6 text-lg leading-8 text-slate-400">
					Secure, remote access to your sunnypilot device. View status, change settings, and manage
					your fleet with a premium, real-time dashboard.
				</p>
				<div class="mt-10 flex items-center justify-center gap-x-6">
					<button
						onclick={handleMainAction}
						class="group flex items-center gap-2 rounded-lg bg-indigo-600 px-6 py-3 text-sm font-semibold text-white shadow-sm transition-all hover:bg-indigo-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600"
					>
						{$authState.isAuthenticated ? 'Go to sunnylink Dashboard' : 'Sign in via sunnylink'}
						<ArrowRight class="h-4 w-4 transition-transform group-hover:translate-x-1" />
					</button>
					<a
						href="https://community.sunnypilot.ai"
						target="_blank"
						class="text-sm leading-6 font-semibold text-white hover:text-indigo-400"
					>
						Join the Community <span aria-hidden="true">→</span>
					</a>
					<a
						href="https://github.com/sunnypilot/sunnylink"
						target="_blank"
						class="text-sm leading-6 font-semibold text-white hover:text-indigo-400"
					>
						Learn more <span aria-hidden="true">→</span>
					</a>
				</div>
			</div>

			<!-- Feature Grid -->
			<div class="mt-24 grid grid-cols-1 gap-8 sm:grid-cols-2 lg:grid-cols-3">
				<div
					class="relative overflow-hidden rounded-2xl border border-white/10 bg-white/5 p-8 transition-colors hover:bg-white/10"
				>
					<div class="mb-4 inline-flex rounded-lg bg-indigo-500/20 p-3 text-indigo-400">
						<Globe class="h-6 w-6" />
					</div>
					<h3 class="mb-2 text-lg font-semibold text-white">Remote Access</h3>
					<p class="text-slate-400">
						Access your device from anywhere in the world. No complex network setup required.
					</p>
				</div>
				<div
					class="relative overflow-hidden rounded-2xl border border-white/10 bg-white/5 p-8 transition-colors hover:bg-white/10"
				>
					<div class="mb-4 inline-flex rounded-lg bg-purple-500/20 p-3 text-purple-400">
						<Smartphone class="h-6 w-6" />
					</div>
					<h3 class="mb-2 text-lg font-semibold text-white">Real-time Control</h3>
					<p class="text-slate-400">
						Toggle settings, reboot, and monitor your device status in real-time.
					</p>
				</div>
				<div
					class="relative overflow-hidden rounded-2xl border border-white/10 bg-white/5 p-8 transition-colors hover:bg-white/10"
				>
					<div class="mb-4 inline-flex rounded-lg bg-teal-500/20 p-3 text-teal-400">
						<Shield class="h-6 w-6" />
					</div>
					<h3 class="mb-2 text-lg font-semibold text-white">Secure & Private</h3>
					<p class="text-slate-400">
						Built with security first. Your data stays private and your connection is encrypted.
					</p>
				</div>
			</div>
		</div>
	</div>
</div>
