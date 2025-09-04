<script lang="ts">
	import { PUBLIC_CALLBACK } from '$env/static/public';
	import { onMount } from 'svelte';

	let { data, children } = $props();

	async function signIn() {
		await data.logtoClient?.signIn(PUBLIC_CALLBACK);
	}

	onMount(() => {
		// If user is not authenticated, store intended destination and trigger sign in
		if (!data.isAuthenticated && data.logtoClient) {
			// Store the current path in sessionStorage
			if (typeof window !== 'undefined') {
				sessionStorage.setItem('redirectAfterAuth', window.location.pathname);
			}
			signIn();
		}
	});
</script>

<!-- Only render children if authenticated -->
{#if data.isAuthenticated}
	{@render children()}
{:else}
	<div class="min-h-screen bg-white flex items-center justify-center">
		<div class="text-center">
			<div class="mb-4 inline-block h-6 w-6 animate-spin rounded-full border-2 border-slate-200 border-t-slate-900"></div>
			<p class="text-sm text-slate-600">Redirecting to sign in...</p>
		</div>
	</div>
{/if}