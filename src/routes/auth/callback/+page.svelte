<script lang="ts">
	import { onMount } from 'svelte';
	import { authState, logtoClient } from '$lib/logto/auth.svelte';
	import { goto, invalidateAll } from '$app/navigation';

	onMount(async () => {
		if (!logtoClient) return;
		await logtoClient.handleSignInCallback(window.location.href);
		await authState.init();

		if (authState.isAuthenticated) {
			// Force re-execution of all load functions to fetch fresh data (e.g. devices)
			await invalidateAll();
			goto('/dashboard');
		} else {
			// Sign-in failed — back to landing (no /login route exists)
			goto('/');
		}
	});
</script>

{#if authState.loading}
	<p>Finishing up...</p>
{:else}
	<p>Redirecting to dashboard...</p>
{/if}
