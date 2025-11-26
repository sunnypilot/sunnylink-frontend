import { v1Client } from '$lib/api/client';
import { deviceState } from '$lib/stores/device.svelte';

export async function checkDeviceStatus(deviceId: string, token: string) {
    if (!deviceId || !token) return;

    // Set to loading if not already determined (or if forcing refresh)
    // We might want to keep the old status while refreshing to avoid flickering,
    // but 'loading' gives feedback. Let's set it to loading.
    deviceState.onlineStatuses[deviceId] = 'loading';

    try {
        const response = await v1Client.GET('/v1/settings/{deviceId}', {
            params: {
                path: { deviceId }
            },
            headers: { Authorization: `Bearer ${token}` }
        });

        // Strict check: Must have items and length > 0
        if (response.data?.items && response.data.items.length > 0) {
            deviceState.onlineStatuses[deviceId] = 'online';
            deviceState.deviceSettings[deviceId] = response.data.items;
        } else {
            // Empty items means we couldn't fetch settings -> likely offline or not ready
            deviceState.onlineStatuses[deviceId] = 'offline';
        }
    } catch (e) {
        console.error(`Failed to check status for ${deviceId}`, e);
        deviceState.onlineStatuses[deviceId] = 'offline';
    }
}
