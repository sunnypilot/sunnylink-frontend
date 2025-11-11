<script lang="ts">
	import { onMount } from 'svelte';
	import { logtoClient } from '$lib/logto/auth';
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
		auth.isAuthenticated = await logtoClient.isAuthenticated();

		if (auth.isAuthenticated) {
			auth.profile = await logtoClient.fetchUserInfo();
			goto('/dashboard');
		} else {
			goto('/');
		}

		auth.loading = false;
	});
</script>

{#if auth.loading}
	<p>Authenticating...</p>
{:else if auth.isAuthenticated}
	<p>Authenticated</p>
	<p>{auth.profile?.name}</p>
{/if}
