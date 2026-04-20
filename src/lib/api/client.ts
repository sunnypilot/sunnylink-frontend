import createClient from 'openapi-fetch';
import type { paths as APIv1Paths } from '../../sunnylink/v1/schema_api';
import type { paths as Athenav1Paths } from '../../sunnylink/v1/schema_athena';
import type { paths as v0Paths } from '../../sunnylink/v0/schema';
import { browser } from '$app/environment';
import { logtoClient, getIdToken } from '$lib/logto/auth.svelte';

/**
 * Custom fetch wrapper that handles 401/403 by retrying with a fresh token.
 * The Logto SDK handles token refresh internally, so we just need to get
 * a new token and retry the request.
 */
export const customFetch: typeof fetch = async (input, init) => {
	const response = await fetch(input, init);

	if (response.status === 401 || response.status === 403) {
		if (browser && logtoClient) {
			try {
				// Get a fresh token - SDK handles refresh if needed
				const newToken = await getIdToken();

				if (newToken) {
					const newHeaders = new Headers(init?.headers);
					newHeaders.set('Authorization', `Bearer ${newToken}`);

					// Retry the request with the new token
					return fetch(input, { ...init, headers: newHeaders });
				}
			} catch (e) {
				console.error('Token refresh failed during 401/403 interception:', e);
			}
		}
	}

	return response;
};

export const API_BASE_URL = 'https://stg.api.sunnypilot.ai';
export const ATHENA_BASE_URL = 'https://athena.sunnylink.ai';

export const APIv1Client = createClient<APIv1Paths>({
	baseUrl: API_BASE_URL + '/',
	fetch: customFetch
});

export const Athenav1Client = createClient<Athenav1Paths>({
	baseUrl: ATHENA_BASE_URL + '/',
	fetch: customFetch
});

export const v0Client = createClient<v0Paths>({
	baseUrl: API_BASE_URL + '/',
	fetch: customFetch
});
