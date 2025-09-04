import LogtoClient from '@logto/browser';
import { browser } from '$app/environment';
import { PUBLIC_LOGTO_APP_ID, PUBLIC_LOGTO_ENDPOINT } from '$env/static/public';

export async function load() {
	if (!browser) return { logtoClient: null, user: null };

	const logtoClient = new LogtoClient({
		endpoint: PUBLIC_LOGTO_ENDPOINT,
		appId: PUBLIC_LOGTO_APP_ID
		// These can be public
	});

	const isAuthenticated = await logtoClient.isAuthenticated();
	const user = isAuthenticated ? await logtoClient.getIdTokenClaims() : null;

	return {
		logtoClient,
		user,
		isAuthenticated
	};
}
export const ssr = false;
