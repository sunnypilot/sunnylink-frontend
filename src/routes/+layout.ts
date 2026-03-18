import { v1Client, v0Client } from '$lib/api/client';
import { logtoClient, getIdToken } from '$lib/logto/auth.svelte';
import type { LayoutLoad } from './$types';
import type { DeviceAuthResponseModel } from '../sunnylink/types';

export type DeviceFetchError = 'auth_expired' | 'api_error' | null;
export type DeviceFetchResult = {
	devices: DeviceAuthResponseModel[];
	error: DeviceFetchError;
};

export const load: LayoutLoad = async ({ url }) => {
	if (url.pathname === '/') {
		return {
			streamed: {
				deviceResult: Promise.resolve({ devices: [], error: null } as DeviceFetchResult)
			}
		};
	}

	const fetchAllDeviceData = async (): Promise<DeviceFetchResult> => {
		if (url.pathname === '/') return { devices: [], error: null };

		if (!logtoClient || !(await logtoClient.isAuthenticated())) {
			return { devices: [], error: 'auth_expired' };
		}

		// Get the token - SDK handles refresh automatically
		let token = await getIdToken();
		if (!token) {
			return { devices: [], error: 'auth_expired' };
		}

		// Helper to fetch list
		const fetchList = async (t: string) => {
			return await v1Client.GET('/v1/users/{userId}/devices', {
				params: { path: { userId: 'self' } },
				headers: { Authorization: `Bearer ${t}` }
			});
		};

		try {
			// Fetch the list with retry
			let devices = await fetchList(token);

			// If 401, get a fresh token and retry
			if (devices.response.status === 401) {
				token = await getIdToken();
				if (token) {
					devices = await fetchList(token);
				} else {
					return { devices: [], error: 'auth_expired' };
				}
			}

			// If still failing after retry, it's an auth or API error
			if (!devices.response.ok) {
				const isAuthError = devices.response.status === 401 || devices.response.status === 403;
				return { devices: [], error: isAuthError ? 'auth_expired' : 'api_error' };
			}

			const items = devices.data?.items ?? [];

			// Parallelize the detail fetches
			const detailPromises = items.map(async (device) => {
				const fetchDetail = async (t: string) => {
					return await v0Client.GET('/device/{deviceId}', {
						params: { path: { deviceId: device.device_id ?? '' } },
						headers: { Authorization: `Bearer ${t}` }
					});
				};

				let response = await fetchDetail(token || '');

				// Retry detail fetch if 401
				if (response.response.status === 401) {
					const freshToken = await getIdToken();
					if (freshToken) {
						response = await fetchDetail(freshToken);
					}
				}

				return response.data;
			});

			// Wait for all requests to finish in parallel
			const allDetails = await Promise.all(detailPromises);

			// Filter out any undefined results (failed requests)
			return {
				devices: allDetails.filter((d): d is DeviceAuthResponseModel => !!d),
				error: null
			};
		} catch (e) {
			console.error('Failed to fetch devices:', e);
			return { devices: [], error: 'api_error' };
		}
	};

	return {
		// Return the Promise directly for streaming
		streamed: {
			deviceResult: fetchAllDeviceData()
		}
	};
};

export const prerender = false;
export const ssr = false;
