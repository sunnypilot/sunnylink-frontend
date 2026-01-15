import { v1Client, v0Client } from '$lib/api/client';
import { logtoClient, getIdToken } from '$lib/logto/auth.svelte';
import type { LayoutLoad } from './$types';
import type { DeviceAuthResponseModel } from '../sunnylink/types';

export const load: LayoutLoad = async ({ url }) => {
	if (url.pathname === '/') {
		return {
			streamed: {
				devices: Promise.resolve([])
			}
		};
	}

	// Define the heavy logic as a standalone async function
	const fetchAllDeviceData = async () => {
		if (url.pathname === '/') return [];
		if (!logtoClient || !(await logtoClient.isAuthenticated())) return [];

		// Get the token - SDK handles refresh automatically
		let token = await getIdToken();
		if (!token) return [];

		// Helper to fetch list
		const fetchList = async (t: string) => {
			return await v1Client.GET('/v1/users/{userId}/devices', {
				params: { path: { userId: 'self' } },
				headers: { Authorization: `Bearer ${t}` }
			});
		};

		// Fetch the list with retry
		let devices = await fetchList(token);

		// If 401, get a fresh token and retry
		if (devices.response.status === 401) {
			token = await getIdToken();
			if (token) {
				devices = await fetchList(token);
			}
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
		return allDetails.filter((d): d is DeviceAuthResponseModel => !!d);
	};

	return {
		// Return the Promise directly for streaming
		streamed: {
			devices: fetchAllDeviceData()
		}
	};
};

export const prerender = false;
export const ssr = false;
