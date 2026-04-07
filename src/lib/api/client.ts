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
const API_TIMEOUT_MS = 30_000; // 30s max for any single API call

export const customFetch: typeof fetch = async (input, init) => {
	// Skip the global timeout if the caller already provides an AbortSignal
	// (e.g., setDeviceParams with its own 20s timeout). Avoids double-abort conflicts.
	// Helper: retry a 401/403 with a fresh token (always with a timeout)
	async function retryWithFreshToken(input: RequestInfo | URL, init?: RequestInit): Promise<Response | null> {
		if (!browser || !logtoClient) return null;
		try {
			const refreshed = await authState.refreshSession();
			if (!refreshed) return null;
			const newToken = await getIdToken();
			if (!newToken) return null;
			const newHeaders = new Headers(init?.headers);
			newHeaders.set('Authorization', `Bearer ${newToken}`);
			const retryController = new AbortController();
			const retryTimeout = setTimeout(() => retryController.abort('API retry timeout'), API_TIMEOUT_MS);
			try {
				return await fetch(input, { ...init, signal: retryController.signal, headers: newHeaders });
			} finally {
				clearTimeout(retryTimeout);
			}
		} catch (e) {
			console.error('Session refresh failed during 401/403 interception:', e);
			return null;
		}
	}

	if (init?.signal) {
		const response = await fetch(input, init);

		if (response.status === 401 || response.status === 403) {
			const retried = await retryWithFreshToken(input, init);
			if (retried) return retried;
		}

		return response;
	}

	// No caller signal — apply global timeout so stale/slow calls
	// never block SvelteKit navigation indefinitely.
	const controller = new AbortController();
	const timeoutId = setTimeout(() => controller.abort('API timeout'), API_TIMEOUT_MS);

	try {
		const response = await fetch(input, {
			...init,
			signal: controller.signal
		});

		if (response.status === 401 || response.status === 403) {
			const retried = await retryWithFreshToken(input, init);
			if (retried) return retried;
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
