import { browser } from '$app/environment';
import LogtoClient, { type UserInfoResponse } from '@logto/browser';
import { PUBLIC_LOGTO_ENDPOINT, PUBLIC_LOGTO_APP_ID } from '$env/static/public';

const config = {
	endpoint: PUBLIC_LOGTO_ENDPOINT,
	appId: PUBLIC_LOGTO_APP_ID,
	resources: []
};

export const PRODUCTION_ORIGIN = 'http://localhost:5173';

export const isNetlifyPreview =
	browser &&
	window.location.origin.includes('netlify.app') &&
	!window.location.origin.includes('www.sunnylink.ai');

export const logtoClient = browser ? new LogtoClient(config) : undefined;

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
