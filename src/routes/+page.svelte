<script lang="ts">
	import { logtoClient } from '$lib/logto/auth';
	import { browser } from '$app/environment';

	export const ssr = false;

	const login = async () => {
		console.log('login');
		if (!logtoClient) return;
		if (!browser || !logtoClient) return;
		if (!window) return;
		await logtoClient.signIn(`${window.location.origin}/auth/callback`);
	};
</script>

<button class="preset-tonal-primary btn" onclick={login}>Login</button>
