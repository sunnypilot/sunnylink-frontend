<script lang="ts">
	import { base } from '$app/paths';
	import { browser } from '$app/environment';
	let { data } = $props();

	let status = $state<string>('Processing authentication...');
	let error = null;

	// Run immediately when the script loads (not in onMount)
	if (browser && typeof window !== 'undefined') {
		processAuth();
	}

	async function processAuth() {
		try {
			// Add delay to ensure page is fully loaded
			await new Promise((resolve) => setTimeout(resolve, 500));

			console.log('Processing auth callback');
			console.log('Current URL:', window.location.href);

			// Check if we have the required parameters
			const urlParams = new URLSearchParams(window.location.search);
			const code = urlParams.get('code');
			const state = urlParams.get('state');

			console.log('Code:', code);
			console.log('State:', state);

			if (!code) {
				throw new Error('No authorization code found');
			}

			// Initialize Logto client
			const { default: LogtoClient } = await import('@logto/browser');
			const logtoClient = data.logtoClient;

			// Handle the callback
			await logtoClient?.handleSignInCallback(window.location.href);

			status = 'Authentication successful! Redirecting...';
			console.log('Auth successful, redirecting...');

			// Force redirect after a short delay
			setTimeout(() => {
				// Check for stored redirect path
				const storedPath = sessionStorage.getItem('redirectAfterAuth');
				let redirectUrl;

				if (storedPath) {
					// Clear the stored path and use it
					sessionStorage.removeItem('redirectAfterAuth');
					redirectUrl = base ? `${base}${storedPath}` : storedPath;
				} else {
					// Default to home
					redirectUrl = base ? `${base}/` : '/';
				}

				console.log('Redirecting to:', redirectUrl);
				window.location.replace(redirectUrl);
			}, 1000);
		} catch (err) {
			console.error('Auth callback error:', err);
			status = 'Authentication failed';
		}
	}
</script>

<!-- Add this to force the script to run -->
<svelte:window />

<div style="padding: 20px; text-align: center;">
	<h1>Authentication</h1>
	<p>{status}</p>

	{#if error}
		<div style="color: red; margin: 20px 0;">
			<p>Error: {error}</p>
			<a href={base || '/'} style="color: blue;">Return to home</a>
		</div>
	{/if}

	<!-- Loading indicator -->
	<div style="margin: 20px 0;">
		<div
			style="display: inline-block; width: 20px; height: 20px; border: 3px solid #f3f3f3; border-top: 3px solid #3498db; border-radius: 50%; animation: spin 1s linear infinite;"
		></div>
	</div>
</div>
