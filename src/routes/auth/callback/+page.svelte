<script lang="ts">
	import { onMount } from 'svelte';
	import { fade } from 'svelte/transition';
	import { authState, logtoClient } from '$lib/logto/auth.svelte';
	import { goto, invalidateAll } from '$app/navigation';

	type Phase = 'verifying' | 'loading' | 'redirecting';
	let phase = $state<Phase>('verifying');
	let phaseLabel = $derived(
		phase === 'verifying'
			? 'Verifying your identity'
			: phase === 'loading'
				? 'Loading your devices'
				: 'Almost there'
	);

	onMount(async () => {
		if (!logtoClient) return;
		try {
			await logtoClient.handleSignInCallback(window.location.href);
			await authState.init();
		} catch (e) {
			console.error('Sign-in callback failed:', e);
			goto('/');
			return;
		}

		if (authState.isAuthenticated) {
			phase = 'loading';
			// Re-run all load functions so devices/etc. fetch with the fresh token
			// before the dashboard mounts.
			await invalidateAll();
			// Flag the next /dashboard mount as a fresh sign-in so it can route
			// the user appropriately (Home if persisted device is online, else
			// /dashboard/devices). sessionStorage clears when the tab closes —
			// we don't want this flag surviving a refresh.
			try {
				sessionStorage.setItem('justSignedIn', '1');
			} catch {
				// private mode etc. — home falls back to default behavior
			}
			phase = 'redirecting';
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
	in:fade={{ duration: 200 }}
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
	{#key phaseLabel}
		<p
			class="mt-4 text-[0.875rem] text-[var(--sl-text-2)]"
			in:fade={{ duration: 180 }}
			out:fade={{ duration: 120 }}
		>
			{phaseLabel}…
		</p>
	{/key}
	<span class="sr-only">{phaseLabel}</span>
</div>
