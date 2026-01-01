import { browser } from '$app/environment';
import LogtoClient, { type UserInfoResponse } from '@logto/browser';
import { PUBLIC_LOGTO_ENDPOINT, PUBLIC_LOGTO_APP_ID } from '$env/static/public';

const config = {
	endpoint: PUBLIC_LOGTO_ENDPOINT,
	appId: PUBLIC_LOGTO_APP_ID,
	resources: []
};

export const logtoClient = browser ? new LogtoClient(config) : undefined;

type StoredAccessToken = { token?: string; expiresAt?: number };

const accessTokenStorageKey = `logto:${PUBLIC_LOGTO_APP_ID}:accessToken`;
const expirySkewSeconds = 60;
let refreshPromise: Promise<string | undefined> | undefined;

export const pickValidAccessToken = (
	map: Record<string, StoredAccessToken>,
	now = Date.now() / 1000,
	skew = expirySkewSeconds
) => {
	return Object.values(map)
		.filter(
			(item): item is { token: string; expiresAt: number } =>
				Boolean(item?.token) &&
				typeof item?.token === 'string' &&
				typeof item?.expiresAt === 'number' &&
				item.expiresAt - skew > now
		)
		.sort((a, b) => (b.expiresAt ?? 0) - (a.expiresAt ?? 0))[0]?.token;
};

const readCachedAccessToken = () => {
	if (!browser) return undefined;
	// Tokens refreshed by LogtoClient are persisted to localStorage under this key
	const raw = localStorage.getItem(accessTokenStorageKey);
	if (!raw) return undefined;

	try {
		const parsed = JSON.parse(raw) as Record<string, StoredAccessToken>;
		return pickValidAccessToken(parsed);
	} catch (error) {
		console.warn('Failed to parse cached Logto access token', error);
		return undefined;
	}
};

export const getAccessTokenWithCache = async (forceRefresh = false) => {
	if (!logtoClient) return undefined;

	if (!forceRefresh) {
		const cached = readCachedAccessToken();
		if (cached) return cached;
	}

	if (refreshPromise) return refreshPromise;

	console.info('Refreshing Logto access token with refresh token');
	refreshPromise = logtoClient.getAccessToken().finally(() => {
		refreshPromise = undefined;
	});

	return refreshPromise;
};

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
				await getAccessTokenWithCache();
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
