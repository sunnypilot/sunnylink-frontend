import createClient from 'openapi-fetch';
import type { paths as v1Paths } from '../../sunnylink/v1/schema';
import type { paths as v0Paths } from '../../sunnylink/v0/schema';
import { browser } from '$app/environment';
import { logtoClient, getIdToken, authState } from '$lib/logto/auth.svelte';

/**
 * Custom fetch wrapper that handles 401/403 by refreshing the session
 * (server round-trip) and retrying with a fresh token.
 *
 * NOTE: getIdToken() only returns cached tokens — it does NOT auto-refresh.
 * We must call authState.refreshSession() first to get a fresh token.
 */
const API_TIMEOUT_MS = 10_000; // 10s max for any single API call

export const customFetch: typeof fetch = async (input, init) => {
	// Wrap every request in an AbortController timeout so stale/slow calls
	// never block SvelteKit navigation indefinitely.
	const controller = new AbortController();
	const timeoutId = setTimeout(() => controller.abort(), API_TIMEOUT_MS);

	try {
		const response = await fetch(input, {
			...init,
			signal: init?.signal ?? controller.signal
		});

		if (response.status === 401 || response.status === 403) {
			if (browser && logtoClient) {
				try {
					// Refresh session (server round-trip) then get fresh token
					const refreshed = await authState.refreshSession();
					if (refreshed) {
						const newToken = await getIdToken();
						if (newToken) {
							const newHeaders = new Headers(init?.headers);
							newHeaders.set('Authorization', `Bearer ${newToken}`);
							return fetch(input, { ...init, headers: newHeaders });
						}
					}
				} catch (e) {
					console.error('Session refresh failed during 401/403 interception:', e);
				}
			}
		}

		return response;
	} finally {
		clearTimeout(timeoutId);
	}
};

export const API_BASE_URL = 'https://stg.api.sunnypilot.ai';

export const v1Client = createClient<v1Paths>({
	baseUrl: API_BASE_URL + '/',
	fetch: customFetch
});

export const v0Client = createClient<v0Paths>({
	baseUrl: API_BASE_URL + '/',
	fetch: customFetch
});
