import { browser } from '$app/environment';
import LogtoClient, { type UserInfoResponse } from '@logto/browser';
import { PUBLIC_LOGTO_ENDPOINT, PUBLIC_LOGTO_APP_ID } from '$env/static/public';

const config = {
	endpoint: PUBLIC_LOGTO_ENDPOINT,
	appId: PUBLIC_LOGTO_APP_ID,
	resources: []
};

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
				this.profile = await logtoClient.fetchUserInfo();
			}
		} catch (e) {
			console.error('Auth init error:', e);
		} finally {
			this.loading = false;
		}
	}
}

export const authState = new AuthState();
