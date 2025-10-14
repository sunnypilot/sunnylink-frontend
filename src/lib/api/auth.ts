import type { Middleware } from 'openapi-fetch';

export const createAuthMiddleware = (token: string): Middleware => ({
	async onRequest({ request }) {
		request.headers.set('Authorization', `Bearer ${token ?? ''}`);
		return request;
	}
});

export const createDynamicAuthMiddleware = (
	getToken: () => Promise<string | null>
): Middleware => ({
	async onRequest({ request }) {
		try {
			const token = await getToken();
			if (token) {
				request.headers.set('Authorization', `Bearer ${token}`);
			}
		} catch {
			// Intentionally ignore token retrieval errors here; callers should handle 401s
		}
		return request;
	}
});
