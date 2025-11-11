<script lang="ts">
	import { logtoClient } from '$lib/logto/auth';

	const login = async () => {
		console.log('login');
		if (!logtoClient) return;
		if (!window) return;
		await logtoClient.signIn(`${window.location.origin}/auth/callback`);
	};
</script>

<button class="btn preset-tonal-primary" onclick={login}>Login</button>
