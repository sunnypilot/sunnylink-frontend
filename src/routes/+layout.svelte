<script lang="ts">
	import { Toaster } from 'svelte-sonner';
	import '../app.css';
	import { base } from '$app/paths';
	import ThemeToggle from '$lib/components/theme-toggle.svelte';
	import { onMount } from 'svelte';
	import { getCurrentTheme } from '$lib/utils/themeFetcher';
	import darkLogo from '$lib/images/sp_white_transparent.png';
	import lightLogo from '$lib/images/sp_black_transparent.png';
	import { PUBLIC_CALLBACK, PUBLIC_REDIRECT } from '$env/static/public';

	let theme = $state('');

	let { data, children } = $props();

	async function signIn() {
		await data.logtoClient?.signIn(PUBLIC_CALLBACK);
	}

	async function signOut() {
		await data.logtoClient?.signOut(PUBLIC_REDIRECT);
	}

	function determineCurrentLogoColor() {
		theme = getCurrentTheme() ?? '';
		console.log(theme);
	}

	onMount(() => {
		determineCurrentLogoColor();
	});
</script>

<Toaster richColors />
<div class="navbar bg-base-100 shadow-sm">
	<div class="navbar-start">
		<div class="dropdown">
			<div tabindex="0" role="button" class="btn btn-ghost btn-circle">
				<svg
					xmlns="http://www.w3.org/2000/svg"
					class="h-5 w-5"
					fill="none"
					viewBox="0 0 24 24"
					stroke="currentColor"
				>
					<path
						stroke-linecap="round"
						stroke-linejoin="round"
						stroke-width="2"
						d="M4 6h16M4 12h16M4 18h7"
					/>
				</svg>
			</div>
				<ul
				  tabindex="-1"
				  class="menu menu-sm dropdown-content bg-base-100 rounded-box z-1 mt-3 w-52 p-2 shadow"
				>
				  <li><a href="{base || '/'}">Homepage</a></li>
				  <li><a href="{base}/">sunnylink</a></li>
				  <li><a href="{base}/dashboard">Dashboard</a></li>
				</ul>
		</div>
	</div>
	<div class="navbar-center">
		{#if theme === 'dark'}
			<img src={darkLogo} class="h-12" alt="darklogo" />
		{:else if theme === 'light'}
			<img src={lightLogo} class="h-12" alt="lightlogo" />
		{/if}
	</div>
	<div class="navbar-end">
		<a href="{base}/dashboard" class="btn btn-ghost">Dashboard</a>

		{#if data.user}
			<div class="dropdown dropdown-left">
				<div tabindex="0" role="button" class="btn btn-ghost btn-circle">
					<img src={data.user.picture} alt="SSO avatar" class="rounded-4xl" />
				</div>
				<ul
					tabindex="-1"
					class="menu menu-sm dropdown-content bg-base-200 rounded-box z-1 mt-3 w-52 p-2 shadow"
				>
					<li>
						<button onclick={signOut}>Logout</button>
					</li>
					<li>
						<ThemeToggle
							onThemeChanged={() => {
								determineCurrentLogoColor();
							}}
						/>
					</li>
				</ul>
			</div>
		{/if}
	</div>
</div>
{@render children()}
<footer class="footer sm:footer-horizontal bg-base-100 text-base-content p-10">
	<aside>
		{#if theme === 'dark'}
			<img src={darkLogo} alt="dark-logo" class="h-24" />
		{:else if theme === 'light'}
			<img src={lightLogo} alt="dark-logo" class="h-24" />
		{:else}
			<img src={lightLogo} alt="dark-logo" class="h-24" />
		{/if}

		<p>
			sunnypilot
			<br />
			Built with ❤️ for you.
		</p>
	</aside>

	<nav>
		<h6 class="footer-title">Company</h6>
		<a class="link link-hover">About us</a>
		<a class="link link-hover" href="https://github.com/sunnypilot/sunnypilot">Github</a>
		<a class="link link-hover" href="https://discord.gg/sunnypilot">Discord</a>
	</nav>
	<nav>
		<h6 class="footer-title">Legal</h6>
		<a class="link link-hover">Terms of use</a>
		<a class="link link-hover">Privacy policy</a>
		<a class="link link-hover">Cookie policy</a>
	</nav>
</footer>
