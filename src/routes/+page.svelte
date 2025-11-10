<script lang="ts">
	import { logtoClient } from '$lib/logto/auth';

    const login = async () => {
        console.log('login');
        if (!logtoClient) return;
        if (!window) return;
        await logtoClient.signIn(`${window.location.origin}/auth/callback`);
    }
</script>

<button class="bg-blue-500 text-white p-2 rounded-md" onclick={login}>Login</button>