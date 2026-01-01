import createClient from 'openapi-fetch';
import type { paths as v1Paths } from '../../sunnylink/v1/schema';
import type { paths as v0Paths } from '../../sunnylink/v0/schema';
import { browser } from '$app/environment';
import { getAccessTokenWithCache, logtoClient } from '$lib/logto/auth.svelte';

const customFetch: typeof fetch = async (input, init) => {
	const response = await fetch(input, init);

	if (response.status === 401 || response.status === 403) {
		if (browser && logtoClient) {
			try {
				// Attempt to refresh the token
				// Helper will reuse cached tokens when possible and fall back to refresh token
				await getAccessTokenWithCache(true);
				const newToken = await logtoClient.getIdToken();

				if (newToken) {
					// Clone the headers to avoid mutating the original object if it's reused elsewhere (though likely safe here)
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

export const v1Client = createClient<v1Paths>({
	baseUrl: 'https://stg.api.sunnypilot.ai/',
	fetch: customFetch
});

export const v0Client = createClient<v0Paths>({
	baseUrl: 'https://stg.api.sunnypilot.ai/',
	fetch: customFetch
});
