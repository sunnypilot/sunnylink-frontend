import { browser } from '$app/environment';
import LogtoClient, { type UserInfoResponse } from '@logto/browser';
import { PUBLIC_LOGTO_ENDPOINT, PUBLIC_LOGTO_APP_ID } from '$env/static/public';

const config = {
	endpoint: PUBLIC_LOGTO_ENDPOINT,
	appId: PUBLIC_LOGTO_APP_ID,
	resources: []
};

export const logtoClient = browser ? new LogtoClient(config) : undefined;

/** Race a promise against a timeout. Returns undefined on timeout. */
function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T | undefined> {
	return Promise.race([
		promise,
		new Promise<undefined>((resolve) => setTimeout(() => resolve(undefined), ms))
	]);
}

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

	/** Cached in-flight init() promise. Ensures concurrent callers share one init pass
	 *  instead of racing `loading`/`isAuthenticated` writes (constructor auto-init vs
	 *  auth/callback's explicit init). */
	#initPromise: Promise<void> | null = null;

	constructor() {
		if (browser && logtoClient) {
			this.init();
		}
	}

	/**
	 * Initialize or re-initialize auth state. Idempotent — concurrent calls await
	 * the same promise. fetchUserInfo() is bounded by a 5s timeout to prevent
	 * navigation hangs.
	 */
	init(): Promise<void> {
		if (this.#initPromise) return this.#initPromise;
		this.#initPromise = this.#doInit().finally(() => {
			this.#initPromise = null;
		});
		return this.#initPromise;
	}

	async #doInit(): Promise<void> {
		if (!logtoClient) return;
		this.loading = true;

		try {
			this.isAuthenticated = await logtoClient.isAuthenticated();

			if (this.isAuthenticated) {
				// 5s timeout — fetchUserInfo can hang on stale sessions
				const profile = await withTimeout(logtoClient.fetchUserInfo(), 5000);
				if (profile) {
					this.profile = profile;
				}
				// If timeout, keep isAuthenticated true but profile may be stale
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
	 * Bounded by a 7s timeout to never block navigation indefinitely.
	 * Returns true if session was successfully refreshed.
	 */
	async refreshSession(): Promise<boolean> {
		if (!logtoClient) return false;
		try {
			const result = await withTimeout(
				(async () => {
					await this.init();
					if (this.isAuthenticated) {
						const token = await logtoClient!.getIdToken();
						return !!token;
					}
					return false;
				})(),
				7000
			);
			return result ?? false;
		} catch {
			return false;
		}
	}
}

export const authState = new AuthState();
