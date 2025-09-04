import type { Middleware } from 'openapi-fetch';

export const createAuthMiddleware = (token: string): Middleware => ({
	async onRequest({ request }) {
		request.headers.set('Authorization', `Bearer ${token ?? ''}`);
		return request;
	}
});
