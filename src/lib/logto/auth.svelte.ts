import { browser } from '$app/environment';
import LogtoClient, { type UserInfoResponse } from '@logto/browser';
import { PUBLIC_LOGTO_ENDPOINT, PUBLIC_LOGTO_APP_ID } from '$env/static/public';

const config = {
	endpoint: PUBLIC_LOGTO_ENDPOINT,
	appId: PUBLIC_LOGTO_APP_ID,
	resources: []
};

export const logtoClient = browser ? new LogtoClient(config) : undefined;

/**
 * Get the current ID token from the Logto client.
 * NOTE: This returns the cached token — it does NOT auto-refresh.
 * If the token is expired, use refreshSession() first.
 */
export const getIdToken = async (): Promise<string | undefined> => {
	if (!logtoClient) return undefined;
	try {
		const token = await logtoClient.getIdToken();
		return token ?? undefined;
	} catch (error) {
		console.error('Failed to get ID token:', error);
		return undefined;
	}
};

/**
 * Get an access token from the Logto client.
 * The SDK handles caching and refresh automatically via refresh token.
 */
export const getAccessToken = async (resource?: string): Promise<string | undefined> => {
	if (!logtoClient) return undefined;
	try {
		return await logtoClient.getAccessToken(resource);
	} catch (error) {
		console.error('Failed to get access token:', error);
		return undefined;
	}
};

/**
 * Reactive authentication state using Svelte 5 runes.
 * Provides loading, authentication status, and user profile.
 */
class AuthState {
	loading = $state(true);
	isAuthenticated = $state(false);
	profile = $state<UserInfoResponse | undefined>(undefined);

	constructor() {
		if (browser && logtoClient) {
			this.init();
		}
	}

	/**
	 * Initialize or re-initialize auth state.
	 * This performs a full session check including server round-trip
	 * via fetchUserInfo(), which can refresh the session.
	 */
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
			this.isAuthenticated = false;
			this.profile = undefined;
		} finally {
			this.loading = false;
		}
	}

	/**
	 * Re-validate the session when we suspect the token is stale.
	 * This is equivalent to what a page refresh does — re-runs init()
	 * which triggers a server round-trip to refresh the session.
	 * Returns true if session was successfully refreshed.
	 */
	async refreshSession(): Promise<boolean> {
		if (!logtoClient) return false;
		try {
			await this.init();
			if (this.isAuthenticated) {
				const token = await logtoClient.getIdToken();
				return !!token;
			}
			return false;
		} catch {
			return false;
		}
	}
}

export const authState = new AuthState();
