import { v1Client, v0Client } from '$lib/api/client';
import { logtoClient } from '$lib/logto/auth.svelte';
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

        // 1. Get the token
        let token = await logtoClient.getIdToken();

        // Helper to fetch list
        const fetchList = async (t: string) => {
            return await v1Client.GET('/v1/users/{userId}/devices', {
                params: { path: { userId: 'self' } },
                headers: { Authorization: `Bearer ${t}` }
            });
        };

        // 2. Fetch the list with retry
        let devices = await fetchList(token || '');

        // If 401, try to refresh token and retry
        if (devices.response.status === 401) {
            try {
                // Force a token refresh (getAccessToken usually handles this)
                await logtoClient.getAccessToken();
                // Get the potentially new ID token
                token = await logtoClient.getIdToken();
                if (token) {
                    devices = await fetchList(token);
                }
            } catch (e) {
                console.error('Failed to refresh token after 401:', e);
            }
        }

        const items = devices.data?.items ?? [];

        // 3. Parallelize the detail fetches
        // Map the items to an array of Promises, then await them all at once
        const detailPromises = items.map(async (device) => {
            // Helper for detail fetch
            const fetchDetail = async (t: string) => {
                return await v0Client.GET('/device/{deviceId}', {
                    params: { path: { deviceId: device.device_id ?? '' } },
                    headers: { Authorization: `Bearer ${t}` }
                });
            };

            let response = await fetchDetail(token || '');

            // Retry detail fetch if 401 (though unlikely if list succeeded with same token)
            if (response.response.status === 401) {
                try {
                    if (logtoClient) {
                        await logtoClient.getAccessToken();
                        token = await logtoClient.getIdToken();
                        if (token) {
                            response = await fetchDetail(token);
                        }
                    }
                } catch (e) {
                    console.error('Failed to refresh token for detail fetch:', e);
                }
            }

            return response.data; // Return the data part
        });

        // Wait for all requests to finish in parallel
        const allDetails = await Promise.all(detailPromises);

        // Filter out any undefined results (failed requests)
        return allDetails.filter((d): d is DeviceAuthResponseModel => !!d);
    };

    return {
        // 4. Return the Promise directly! Do NOT await fetchAllDeviceData() here.
        streamed: {
            devices: fetchAllDeviceData()
        }
    };
};

export const prerender = false;
export const ssr = false;
