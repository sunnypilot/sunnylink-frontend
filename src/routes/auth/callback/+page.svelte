<script lang="ts">
	import { onMount } from 'svelte';
	import { authState, logtoClient } from '$lib/logto/auth.svelte';
	import type { UserInfoResponse } from '@logto/browser';
	import { goto } from '$app/navigation';

	const auth = $state({
		loading: true,
		isAuthenticated: false,
		profile: undefined as UserInfoResponse | undefined
	});

	onMount(async () => {
		if (!logtoClient) return;
		await logtoClient.handleSignInCallback(window.location.href);
		await authState.init();

		if (authState.isAuthenticated) {
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
