import createClient from 'openapi-fetch';
import type { paths as APIv1Paths } from '../../sunnylink/v1/schema_api';
import type { paths as Athenav1Paths } from '../../sunnylink/v1/schema_athena';
import type { paths as APIv0Paths } from '../../sunnylink/v0/schema_api';
import type { paths as Athenav0Paths } from '../../sunnylink/v0/schema_athena';
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

// Paths matching ws/settings/navigation (with or without v{N} prefix) are served
// by the Athena HTTP gateway at athena.sunnylink.ai. All other paths stay on the
// sunnylink main API. Backend is deprecating the CloudFront proxy that currently
// forwards these paths from stg.api.sunnypilot.ai → athena.sunnylink.ai.
const ATHENA_PATH_RE = /^\/(?:v\d+\/)?(?:ws|settings|navigation)(?:\/|$)/;

function rewriteIfAthena(input: RequestInfo | URL): RequestInfo | URL {
	try {
		const apiHost = new URL(API_BASE_URL).host;
		const athenaHost = new URL(ATHENA_BASE_URL).host;
		const rawUrl =
			typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
		const parsed = new URL(rawUrl);
		if (parsed.host !== apiHost) return input;
		if (!ATHENA_PATH_RE.test(parsed.pathname)) return input;
		parsed.host = athenaHost;
		parsed.protocol = new URL(ATHENA_BASE_URL).protocol;
		if (typeof input === 'string') return parsed.toString();
		if (input instanceof URL) return parsed;
		return new Request(parsed, input);
	} catch {
		return input;
	}
}

export const customFetch: typeof fetch = async (input, init) => {
	input = rewriteIfAthena(input);
	// Skip the global timeout if the caller already provides an AbortSignal
	// (e.g., setDeviceParams with its own 20s timeout). Avoids double-abort conflicts.
	// Helper: retry a 401/403 with a fresh token (always with a timeout)
	async function retryWithFreshToken(
		input: RequestInfo | URL,
		init?: RequestInit
	): Promise<Response | null> {
		if (!browser || !logtoClient) return null;
		try {
			const refreshed = await authState.refreshSession();
			if (!refreshed) return null;
			const newToken = await getIdToken();
			if (!newToken) return null;
			const newHeaders = new Headers(init?.headers);
			newHeaders.set('Authorization', `Bearer ${newToken}`);
			const retryController = new AbortController();
			const retryTimeout = setTimeout(
				() => retryController.abort('API retry timeout'),
				API_TIMEOUT_MS
			);
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
export const ATHENA_BASE_URL = 'https://athena.sunnylink.ai';

export const APIv1Client = createClient<APIv1Paths>({
	baseUrl: API_BASE_URL + '/',
	fetch: customFetch
});

export const Athenav1Client = createClient<Athenav1Paths>({
	baseUrl: ATHENA_BASE_URL + '/',
	fetch: customFetch
});

export const APIv0Client = createClient<APIv0Paths>({
	baseUrl: API_BASE_URL + '/',
	fetch: customFetch
});

export const Athenav0Client = createClient<Athenav0Paths>({
	baseUrl: ATHENA_BASE_URL + '/',
	fetch: customFetch
});
