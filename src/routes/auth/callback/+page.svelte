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

<div
	class="flex min-h-screen flex-col items-center justify-center bg-[var(--sl-bg-page)] px-6"
	role="status"
	aria-live="polite"
>
	<p
		class="font-audiowide text-[1.5rem] font-semibold tracking-[0.20em] text-[var(--sl-text-1)] uppercase"
	>
		sunnylink
	</p>
	<span
		class="loading mt-8 loading-spinner text-primary"
		style="width: 24px; height: 24px;"
		aria-hidden="true"
	></span>
	<span class="sr-only">Signing you in</span>
</div>
