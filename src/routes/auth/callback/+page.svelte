<script lang="ts">
	import { onMount } from 'svelte';
	import { logtoClient } from '$lib/logto/auth';
	import type { UserInfoResponse } from '@logto/browser';

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
		}

		auth.loading = false;
	});

	const logout = () => {
		if (!logtoClient) return;
		if (!window) return;
		logtoClient?.signOut(`${window.location.origin}`);
	};
</script>

{#if auth.loading}
	<p>Authenticating...</p>
{:else if auth.isAuthenticated}
	<p>Authenticated</p>
	<p>{auth.profile?.name}</p>
	<button onclick={logout}>Logout</button>
{:else}
	<p>Not authenticated</p>
{/if}
