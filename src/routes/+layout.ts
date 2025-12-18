import { v1Client, v0Client } from '$lib/api/client';
import { logtoClient } from '$lib/logto/auth.svelte';
import type { LayoutLoad } from './$types';
import type { DeviceAuthResponseModel } from '../sunnylink/types';

export const load: LayoutLoad = async () => {
    // Define the heavy logic as a standalone async function
    const fetchAllDeviceData = async () => {
        if (!logtoClient) return [];

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

        // 3. Parallelize the detail fetches with Caching
        // We use a simple in-memory cache for the session.
        // Since alias usage is rare to change outside of this client, this is safe for a session.
        if (typeof globalThis !== 'undefined' && !(globalThis as any)._deviceDetailCache) {
            (globalThis as any)._deviceDetailCache = new Map<string, DeviceAuthResponseModel>();
        }
        const cache = (globalThis as any)._deviceDetailCache as Map<string, DeviceAuthResponseModel>;

        const detailPromises = items.map(async (device) => {
            const deviceId = device.device_id;
            if (!deviceId) return null;

            // Return cached if available
            if (cache.has(deviceId)) {
                return cache.get(deviceId);
            }

            // Helper for detail fetch
            const fetchDetail = async (t: string) => {
                return await v0Client.GET('/device/{deviceId}', {
                    params: { path: { deviceId: deviceId ?? '' } },
                    headers: { Authorization: `Bearer ${t}` }
                });
            };

            let response = await fetchDetail(token || '');

            // Retry detail fetch if 401
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

            if (response.data) {
                cache.set(deviceId, response.data);
                return response.data;
            }
            return null;
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
