import { browser } from '$app/environment';
import LogtoClient, { type UserInfoResponse, LogtoRequestError } from '@logto/browser';
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
	/** True from the moment the user clicks any "Sign in" button until either
	 *  the OAuth redirect happens (resolves never — full page nav cancels JS)
	 *  or the SDK call throws before redirect (we then reset). Drives in-button
	 *  spinners so the UI doesn't appear dead during PKCE setup + nav lag. */
	isSigningIn = $state(false);
	/** Set when we detect that a previously-valid session has died mid-use —
	 *  either an API call returned 401/403 even after a refresh-retry, or the
	 *  tab-focus revalidation found the refresh grant invalid. Drives the
	 *  session-expired modal so the UI doesn't keep accepting clicks that
	 *  silently fail. Cleared by the modal's dismiss / sign-in handlers. */
	sessionExpired = $state(false);

	/** Cached in-flight init() promise. Ensures concurrent callers share one init pass
	 *  instead of racing `loading`/`isAuthenticated` writes (constructor auto-init vs
	 *  auth/callback's explicit init). */
	#initPromise: Promise<void> | null = null;

	/** Tracks whether the first init has completed. Subsequent inits (e.g. silent
	 *  refresh after a 401) must not toggle `loading` back to true — that would
	 *  cause every `{#if authState.loading}` skeleton branch to remount, flashing
	 *  content out and back in for visible UI. */
	#initialized = false;

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
		// Only flip loading=true on the first init. Re-inits triggered by silent
		// session refresh keep the existing UI rendered to avoid flashing skeletons.
		if (!this.#initialized) this.loading = true;

		// Compute the final auth result locally and commit to reactive state ONCE at the end.
		// Writing `isAuthenticated = true` before confirming fetchUserInfo succeeds caused a
		// transient true → false flicker when the server-side refresh grant was invalid, which
		// triggered the layout's `$effect(() => isAuthenticated && invalidate('app:devices'))`
		// cascade: load → 401 → refreshSession → init → flicker again → loop.
		let finalAuthed = false;
		let finalProfile: UserInfoResponse | undefined = undefined;

		try {
			if (await logtoClient.isAuthenticated()) {
				try {
					// 10s timeout — fetchUserInfo can hang on stale sessions. The SDK auto-refreshes
					// the access token via the refresh token here, so a revoked/invalid grant
					// surfaces as a LogtoRequestError from this call.
					const profile = await withTimeout(logtoClient.fetchUserInfo(), 10000);
					if (profile) {
						finalAuthed = true;
						finalProfile = profile;
					}
					// Timeout (profile === undefined): treat as unauthenticated rather than committing
					// a half-authenticated state. User retries via Sign In; no cascade.
				} catch (e) {
					// Distinguish refresh-grant failure from transient network failure. Only the
					// former should wipe local tokens — clearing on a network blip would sign the
					// user out whenever they lose connectivity briefly, which is unacceptable UX.
					//
					// `LogtoRequestError` is thrown only when the server responded with a non-2xx
					// and a parseable OIDC error body (see SDK requester.js). `fetch()` failures,
					// timeouts, and CORS errors throw native `TypeError`/`AbortError` instead, so
					// they slip past this branch and leave tokens intact for the next try.
					if (e instanceof LogtoRequestError) {
						console.error('Auth init: refresh grant invalid, clearing stale tokens', e);
						try {
							await logtoClient.clearAllTokens();
						} catch (clearErr) {
							console.error('Failed to clear stale tokens:', clearErr);
						}
					} else {
						console.error('Auth init: transient fetchUserInfo failure, keeping tokens', e);
					}
				}
			}
		} catch (e) {
			console.error('Auth init error:', e);
		} finally {
			this.isAuthenticated = finalAuthed;
			this.profile = finalProfile;
			this.loading = false;
			this.#initialized = true;
		}
	}

	/**
	 * Begin the OAuth sign-in flow. Idempotent — concurrent clicks share one
	 * call. The SDK does PKCE setup then full-page nav; this method only
	 * returns if the SDK throws before redirecting (in which case we reset
	 * isSigningIn so the button re-enables).
	 */
	async signIn(redirectUri: string): Promise<void> {
		if (!logtoClient || this.isSigningIn) return;
		this.isSigningIn = true;
		// Clear the expired flag pre-emptively — the user is acting on the
		// modal's "Sign in" CTA, so we shouldn't keep showing it.
		this.sessionExpired = false;
		try {
			await logtoClient.signIn(redirectUri);
		} catch (e) {
			console.error('Sign-in failed:', e);
			this.isSigningIn = false;
		}
	}

	/**
	 * Mark the current session as dead. Called from customFetch when a 401/403
	 * persists after a refresh-retry, or from the visibility-change check when
	 * the SDK reports the refresh grant invalid. Idempotent — won't fire if we
	 * never thought we were authed in the first place.
	 */
	markSessionExpired() {
		if (!this.isAuthenticated) return;
		this.isAuthenticated = false;
		this.sessionExpired = true;
	}

	/**
	 * Lightweight session check used on tab-visibility change. The SDK's
	 * getAccessToken auto-refreshes via the refresh-token grant if the cached
	 * token is expired; if the grant itself is invalid (session truly dead),
	 * it throws LogtoRequestError and we surface that as expired. Network
	 * errors are swallowed as transient — the next real API call's 401 path
	 * (customFetch) is the authoritative detector.
	 */
	async validateSessionQuiet(): Promise<void> {
		if (!logtoClient || !this.isAuthenticated) return;
		try {
			await logtoClient.getAccessToken();
		} catch (e) {
			if (e instanceof LogtoRequestError) {
				console.warn('Session validation: refresh grant invalid, marking expired');
				this.markSessionExpired();
			}
			// transient network/CORS — ignore
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
