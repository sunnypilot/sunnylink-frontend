<script lang="ts">
	import { onMount } from 'svelte';
	import { authState, logtoClient } from '$lib/logto/auth.svelte';
	import type { UserInfoResponse } from '@logto/browser';
	import { goto, invalidateAll } from '$app/navigation';

	const auth = $state({
		loading: true,
		isAuthenticated: false,
		profile: undefined as UserInfoResponse | undefined
	});

	onMount(async () => {
		if (!logtoClient) return;

		// Check for bounce cookie
		const cookies = document.cookie.split(';');
		const proxyOriginCookie = cookies.find((c) => c.trim().startsWith('logto_proxy_origin='));

		if (proxyOriginCookie) {
			const parts = proxyOriginCookie.split('=');
			if (parts.length < 2) return;
			const proxyOrigin = parts[1].trim();
			// Clear the cookie
			document.cookie =
				'logto_proxy_origin=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT; SameSite=Lax; Secure';

			// Redirect back to preview site with the same query params
			window.location.href = `${proxyOrigin}/auth/callback${window.location.search}`;
			return;
		}

		await logtoClient.handleSignInCallback(window.location.href);
		await authState.init();

		if (authState.isAuthenticated) {
			// Force re-execution of all load functions to fetch fresh data (e.g. devices)
			await invalidateAll();
			goto('/dashboard');
		} else {
			goto('/login');
		}
	});
</script>

{#if authState.loading}
	<p>Finishing up...</p>
{:else}
	<p>Redirecting to dashboard...</p>
{/if}
