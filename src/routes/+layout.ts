import { v1Client, v0Client } from '$lib/api/client';
import { logtoClient } from '$lib/logto/auth.svelte';
import type { LayoutLoad } from './$types';
import type { DeviceAuthResponseModel } from '../sunnylink/types';

export const load: LayoutLoad = async () => {
    // Define the heavy logic as a standalone async function
    const fetchAllDeviceData = async () => {
        if (!logtoClient) return [];

        // 1. Get the token ONCE to reuse (optimization)
        const token = await logtoClient.getIdToken();

        // 2. Fetch the list
        const devices = await v1Client.GET('/v1/users/{userId}/devices', {
            params: { path: { userId: 'self' } },
            headers: { Authorization: `Bearer ${token}` }
        });

        const items = devices.data?.items ?? [];

        // 3. Parallelize the detail fetches
        // Map the items to an array of Promises, then await them all at once
        const detailPromises = items.map(async (device) => {
            const response = await v0Client.GET('/device/{deviceId}', {
                params: { path: { deviceId: device.device_id ?? '' } },
                headers: { Authorization: `Bearer ${token}` }
            });
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
