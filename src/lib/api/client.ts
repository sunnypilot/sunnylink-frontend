import createClient from 'openapi-fetch';
import type { paths as v1Paths } from '../../sunnylink/v1/schema';
import type { paths as v0Paths } from '../../sunnylink/v0/schema';

const customFetch: typeof fetch = async (input, init) => {
	const MAX_RETRIES = 3;
	const BASE_DELAY = 1000;

	for (let i = 0; i < MAX_RETRIES; i++) {
		try {
			const response = await fetch(input, init);

			// Retry on 408 (Request Timeout), 429 (Too Many Requests), 5xx (Server Errors)
			if (response.status === 408 || response.status === 429 || response.status >= 500) {
				// Allow final attempt to pass through error
				if (i === MAX_RETRIES - 1) return response;

				const delay = BASE_DELAY * Math.pow(2, i) + Math.random() * 100; // jitter
				await new Promise((resolve) => setTimeout(resolve, delay));
				continue;
			}

			return response;
		} catch (error) {
			// Network errors (fetch throws)
			if (i === MAX_RETRIES - 1) throw error;

			const delay = BASE_DELAY * Math.pow(2, i) + Math.random() * 100;
			await new Promise((resolve) => setTimeout(resolve, delay));
		}
	}
	// Should be unreachable due to loop logic, but typescript needs return
	return fetch(input, init);
};

export const v1Client = createClient<v1Paths>({
	baseUrl: 'https://stg.api.sunnypilot.ai/',
	fetch: customFetch
});

export const v0Client = createClient<v0Paths>({
	baseUrl: 'https://stg.api.sunnypilot.ai/',
	fetch: customFetch
});
