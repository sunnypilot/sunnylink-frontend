<script lang="ts">
	import { onMount } from 'svelte';
	import { page } from '$app/state';
	import { logtoClient } from '$lib/logto/auth.svelte';

	onMount(async () => {
		const origin = page.url.searchParams.get('origin');
		if (origin && logtoClient) {
			// Set cookie to remember where to bounce back to
			// Using a simple cookie that expires in 10 minutes
			const expires = new Date(Date.now() + 10 * 60 * 1000).toUTCString();
			document.cookie = `logto_proxy_origin=${origin}; path=/; expires=${expires}; SameSite=Lax; Secure`;

			// Start sign in with the production callback
			await logtoClient.signIn(`${window.location.origin}/auth/callback`);
		} else {
			// fallback to normal sign in if no origin specified
			await logtoClient?.signIn(`${window.location.origin}/auth/callback`);
		}
	});
</script>

<div class="flex min-h-screen items-center justify-center bg-[#0f1726] text-white">
	<div class="text-center">
		<div
			class="mx-auto mb-4 h-12 w-12 animate-spin rounded-full border-4 border-indigo-500 border-t-transparent"
		></div>
		<h1 class="text-xl font-semibold">Redirecting to sunnylink login...</h1>
		<p class="mt-2 text-slate-400">Please wait while we set up your secure session.</p>
	</div>
</div>
