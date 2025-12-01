import { v1Client, v0Client } from '$lib/api/client';
import { deviceState } from '$lib/stores/device.svelte';
import type { ExtendedDeviceParamKey } from '$lib/types/settings';
import { decodeParamValue } from '$lib/utils/device';

export async function checkDeviceStatus(deviceId: string, token: string) {
    if (!deviceId || !token) return;

    deviceState.onlineStatuses[deviceId] = 'loading';

    try {
        const [settingsRes, valuesRes] = await Promise.all([
            v1Client.GET('/v1/settings/{deviceId}', {
                params: {
                    path: { deviceId }
                },
                headers: { Authorization: `Bearer ${token}` }
            }),
            v1Client.GET('/v1/settings/{deviceId}/values', {
                params: {
                    path: { deviceId },
                    query: { paramKeys: ['IsOffroad', 'OffroadMode'] }
                },
                headers: { Authorization: `Bearer ${token}` }
            })
        ]);

        // Strict check: Must have items and length > 0
        if (settingsRes.data?.items && settingsRes.data.items.length > 0) {
            deviceState.onlineStatuses[deviceId] = 'online';
            deviceState.deviceSettings[deviceId] = settingsRes.data.items as ExtendedDeviceParamKey[];

            // Process Offroad Status from valuesRes
            if (valuesRes.data?.items) {
                const isOffroadParam = valuesRes.data.items.find((i) => i.key === 'IsOffroad');
                const offroadModeParam = valuesRes.data.items.find((i) => i.key === 'OffroadMode');

                let isOffroad = false;
                let forceOffroad = false;

                if (isOffroadParam) {
                    const val = decodeParamValue(isOffroadParam);
                    isOffroad = val === '1' || val === 1 || val === true || val === 'true';
                }

                if (offroadModeParam) {
                    const val = decodeParamValue(offroadModeParam);
                    forceOffroad = val === '1' || val === 1 || val === true || val === 'true';
                }

                deviceState.offroadStatuses[deviceId] = { isOffroad, forceOffroad };
            }
        } else {
            // Empty items means we couldn't fetch settings -> likely offline or not ready
            deviceState.onlineStatuses[deviceId] = 'offline';
        }
    } catch (e) {
        console.error(`Failed to check status for ${deviceId}`, e);
        deviceState.onlineStatuses[deviceId] = 'offline';
    }
}

export async function deregisterDevice(deviceId: string, token: string) {
    // Real implementation:
    return await v0Client.DELETE('/device/{deviceId}', {
        params: {
            path: { deviceId }
        },
        headers: { Authorization: `Bearer ${token}` }
    });
}

export async function removeUserFromDevice(deviceId: string, userId: string, token: string) {
    return await v0Client.DELETE('/device/{deviceId}/users/{userId}', {
        params: {
            path: { deviceId, userId }
        },
        headers: { Authorization: `Bearer ${token}` }
    });
}
