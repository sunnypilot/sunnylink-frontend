import { describe, expect, it } from 'vitest';

// Note: The authentication module has been simplified to let the Logto SDK
// handle token caching and refresh internally. The custom functions
// (pickValidAccessToken, isIdTokenExpiring, getAccessTokenWithCache)
// have been removed as they were over-engineering what the SDK already does.

describe('auth module', () => {
	it('exports logtoClient as undefined in non-browser environment', async () => {
		// In test environment (non-browser), logtoClient should be undefined
		const { logtoClient } = await import('./auth.svelte');
		expect(logtoClient).toBeUndefined();
	}, 10000);

	it('exports getIdToken function', async () => {
		const { getIdToken } = await import('./auth.svelte');
		expect(typeof getIdToken).toBe('function');
	});

	it('exports getAccessToken function', async () => {
		const { getAccessToken } = await import('./auth.svelte');
		expect(typeof getAccessToken).toBe('function');
	});

	it('getIdToken returns undefined when logtoClient is undefined', async () => {
		const { getIdToken } = await import('./auth.svelte');
		const result = await getIdToken();
		expect(result).toBeUndefined();
	});

	it('getAccessToken returns undefined when logtoClient is undefined', async () => {
		const { getAccessToken } = await import('./auth.svelte');
		const result = await getAccessToken();
		expect(result).toBeUndefined();
	});
});
