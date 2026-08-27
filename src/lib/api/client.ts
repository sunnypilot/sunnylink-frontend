import createClient from 'openapi-fetch';
import type { paths as APIv1Paths } from '../../sunnylink/v1/schema_api';
import type { paths as Athenav1Paths } from '../../sunnylink/v1/schema_athena';
import type { paths as APIv0Paths } from '../../sunnylink/v0/schema_api';
import type { paths as Athenav0Paths } from '../../sunnylink/v0/schema_athena';
import { browser } from '$app/environment';
import { logtoClient, getIdToken, authState } from '$lib/logto/auth.svelte';
import { rewriteToLocal, isDeviceLocalSync } from '$lib/api/local-discovery';

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

/** Extract deviceId from an Athena URL path. */
function extractDeviceId(pathname: string): string | null {
	// Match /v1/settings/{deviceId}/... or /settings/{deviceId}/... or /ws/{deviceId}/...
	const m = pathname.match(/^\/(?:v\d+\/)?(?:settings|ws)\/([^/]+)/);
	if (!m || !m[1]) return null;
	return decodeURIComponent(m[1]);
}

function rewriteIfAthena(input: RequestInfo | URL): RequestInfo | URL {
	try {
		const rawUrl =
			typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
		const parsed = new URL(rawUrl);

		// Check if the URL is targeting the Athena host
		const athenaHost = new URL(ATHENA_BASE_URL).host;
		const isAthena = parsed.host === athenaHost;

		// Also check if it's a main-API URL that should be routed to Athena
		const apiHost = new URL(API_BASE_URL).host;
		const isApiToAthena = parsed.host === apiHost && ATHENA_PATH_RE.test(parsed.pathname);

		if (!isAthena && !isApiToAthena) return input;

		// If the URL is from the main API (not yet rewritten to Athena),
		// rewrite it to Athena first
		if (isApiToAthena) {
			parsed.host = athenaHost;
			parsed.protocol = new URL(ATHENA_BASE_URL).protocol;
		}

		// Check if we can route this locally
		const deviceId = extractDeviceId(parsed.pathname);
		if (deviceId) {
			const localUrl = rewriteToLocal(parsed.pathname + parsed.search, deviceId!);
			if (localUrl) {
				console.debug('[local] routing to device:', localUrl.slice(0, 80));
				if (typeof input === 'string') return localUrl;
				if (input instanceof URL) return new URL(localUrl);
				return new Request(localUrl, input);
			}
		}

		if (typeof input === 'string') return parsed.toString();
		if (input instanceof URL) return parsed;
		return new Request(parsed, input);
	} catch {
		return input;
	}
}

/** Detect if a URL points to a local-network device (HTTP, not HTTPS).
 *  We must use raw XMLHttpRequest for these because browser extensions
 *  (VPNs, security tools) often wrap window.fetch and force TLS — causing
 *  ERR_ALPN_NEGOTIATION_FAILED on our plain-HTTP local server. */
function isLocalUrl(input: RequestInfo | URL): boolean {
	try {
		const raw = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
		return raw.startsWith('http://');
	} catch {
		return false;
	}
}

/** Extract {url, init} from either calling convention.
 *
 *  Handles the fact that openapi-fetch wraps everything in `new Request()`
 *  and calls `fetch(request)`. The Request's body is a ReadableStream, so
 *  we must read it into a string before handing to XHR. */
async function _normalizeFetchArgs(
	input: RequestInfo | URL,
	init?: RequestInit
): Promise<{ url: string; init: RequestInit }> {
	const isRequest = !(typeof input === 'string' || input instanceof URL);
	if (isRequest) {
		const req = input as Request;
		// Read the body stream (if any) into a string that XHR can send
		let body: BodyInit | null = null;
		if (req.body) {
			try {
				body = await req.clone().text();
			} catch {
				// body is already consumed or not clonable — send nothing
			}
		}
		return {
			url: req.url,
			init: {
				method: req.method,
				headers: req.headers,
				body,
				signal: (req as any).signal
			}
		};
	}
	return {
		url: typeof input === 'string' ? input : (input as URL).toString(),
		init: init ?? {}
	};
}

/** Raw XHR fetch for local HTTP URLs that browser extensions can't intercept. */
function xhrFetch(url: string, init: RequestInit): Promise<Response> {
	return new Promise((resolve, reject) => {
		const method = init.method ?? 'GET';
		console.debug('[local] XHR', method, url.slice(0, 100));
		const xhr = new XMLHttpRequest();
		xhr.open(method, url, true);

		if (init.headers) {
			const h = new Headers(init.headers);
			h.forEach((v, k) => { if (k !== 'authorization') xhr.setRequestHeader(k, v); });
		}

		xhr.timeout = 30_000;
		xhr.responseType = 'arraybuffer';

		if (init.signal) {
			init.signal.addEventListener('abort', () => xhr.abort());
		}

		xhr.onload = () => {
			const body = xhr.response instanceof ArrayBuffer ? xhr.response : null;
			const headers = new Headers();
			const hdr = xhr.getAllResponseHeaders();
			for (const line of hdr.trim().split(/\r?\n/)) {
				const i = line.indexOf(':');
				if (i > 0) headers.set(line.slice(0, i).trim(), line.slice(i + 1).trim());
			}
			resolve(new Response(body, { status: xhr.status, statusText: xhr.statusText, headers }));
		};
		xhr.onerror = () => reject(new Error('XHR error'));
		xhr.ontimeout = () => reject(new Error('XHR timeout'));
		xhr.onabort = () => reject(new DOMException('Aborted', 'AbortError'));

		xhr.send(init.body as XMLHttpRequestBodyInit | null ?? null);
	});
}

export const customFetch: typeof fetch = async (input, init) => {
	input = rewriteIfAthena(input);

	// Use raw XHR for local HTTP URLs to bypass extension TLS-forcing.
	// openapi-fetch passes a single Request object (no `init`), so normalise
	// both forms into url + init before handing off to xhrFetch.
	if (isLocalUrl(input)) {
		const norm = await _normalizeFetchArgs(input, init);
		return xhrFetch(norm.url, norm.init);
	}

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

	// Helper: handle a 401/403 by retrying once with a fresh token. If the
	// retry still fails (or couldn't even attempt), declare the session dead so
	// the UI can surface a session-expired modal — without this, the user
	// keeps clicking buttons that silently 401, which is the worst UX.
	async function handleAuthFailure(
		original: Response,
		input: RequestInfo | URL,
		init?: RequestInit
	): Promise<Response> {
		const retried = await retryWithFreshToken(input, init);
		const stillBad = !retried || retried.status === 401 || retried.status === 403;
		if (stillBad && browser) authState.markSessionExpired();
		return retried ?? original;
	}

	if (init?.signal) {
		const response = await fetch(input, init);

		if (response.status === 401 || response.status === 403) {
			return handleAuthFailure(response, input, init);
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
			return handleAuthFailure(response, input, init);
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
