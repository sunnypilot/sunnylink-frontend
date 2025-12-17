import { browser } from '$app/environment';
import LogtoClient, { type UserInfoResponse } from '@logto/browser';
import { PUBLIC_LOGTO_ENDPOINT, PUBLIC_LOGTO_APP_ID } from '$env/static/public';
import { PUBLIC_PRODUCTION_APP_URL } from '$lib/config';

const config = {
	endpoint: PUBLIC_LOGTO_ENDPOINT,
	appId: PUBLIC_LOGTO_APP_ID,
	resources: []
};

export const logtoClient = browser ? new LogtoClient(config) : undefined;

export async function initiateLogin() {
	if (!browser || !logtoClient) return;

	const productionUrl = PUBLIC_PRODUCTION_APP_URL?.replace(/\/$/, '');
	const currentOrigin = window.location.origin;
	const isLocalhost = currentOrigin.includes('localhost') || currentOrigin.includes('127.0.0.1');

	// If we are in a non-production, non-localhost environment (Project Preview),
	// we redirect to the production URL to handle the login callback.
	if (productionUrl && currentOrigin !== productionUrl && !isLocalhost) {
		// Save the current preview URL so we can redirect back to it after auth
		// Use a short expiration (5 mins)
		const isSecure = window.location.protocol === 'https:';
		document.cookie = `netlify_preview_url=${encodeURIComponent(window.location.href)}; path=/; max-age=300; SameSite=Lax${isSecure ? '; Secure' : ''}`;

		// Redirect to production auth callback
		await logtoClient.signIn(`${productionUrl}/auth/callback`);
	} else {
		// Normal flow for Production and Localhost
		await logtoClient.signIn(`${window.location.origin}/auth/callback`);
	}
}

class AuthState {
	loading = $state(true);
	isAuthenticated = $state(false);
	profile = $state<UserInfoResponse | undefined>(undefined);

	constructor() {
		if (browser && logtoClient) {
			this.init();
		}
	}

	async init() {
		if (!logtoClient) return;
		this.loading = true;

		try {
			this.isAuthenticated = await logtoClient.isAuthenticated();

			if (this.isAuthenticated) {
				// Only attempt to get access token (refresh) if we think we are authenticated
				await logtoClient.getAccessToken();
				this.profile = await logtoClient.fetchUserInfo();
			}
		} catch (e) {
			console.error('Auth init error:', e);
			// If error occurs (e.g. refresh failed), assume not authenticated
			this.isAuthenticated = false;
			this.profile = undefined;
		} finally {
			this.loading = false;
		}
	}
}

export const authState = new AuthState();
