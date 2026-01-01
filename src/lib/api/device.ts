import { v1Client, v0Client } from '$lib/api/client';
import { demoContext } from '$lib/demo/demoContext.svelte';
import {
	demoCheckDeviceStatus,
	demoDeregisterDevice,
	demoGetCarList,
	demoSetDeviceParams
} from '$lib/demo/demoMode.svelte';
import { deviceState } from '$lib/stores/device.svelte';
import type { ExtendedDeviceParamKey } from '$lib/types/settings';
import { decodeParamValue } from '$lib/utils/device';

export async function checkDeviceStatus(deviceId: string, token: string) {
	if (demoContext.isActive) {
		await demoCheckDeviceStatus(deviceId);
		return;
	}
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

        if (settingsRes.error) {
            const status = settingsRes.response?.status || 500;
            if (status === 404) {
                deviceState.onlineStatuses[deviceId] = 'offline';
            } else {
                deviceState.onlineStatuses[deviceId] = 'error';
                // @ts-expect-error - Checking generic error detail
                deviceState.lastErrorMessages[deviceId] = settingsRes.error.detail || settingsRes.error.message || `Error ${status}`;
            }
            return;
        }

        // Strict check: Must have items and length > 0
        if (settingsRes.data?.items && settingsRes.data.items.length > 0) {
            deviceState.onlineStatuses[deviceId] = 'online';
            deviceState.deviceSettings[deviceId] = settingsRes.data.items as ExtendedDeviceParamKey[];
            // Clear any previous error
            delete deviceState.lastErrorMessages[deviceId];

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
            // If it was a 200 OK but empty, treat as offline or specialized empty state?
            // Existing logic treated as offline.
            deviceState.onlineStatuses[deviceId] = 'offline';
        }
    } catch (e: any) {
        console.error(`Failed to check status for ${deviceId}`, e);
        // Network errors or other exceptions are definitely errors, not just "offline"
        deviceState.onlineStatuses[deviceId] = 'error';
        deviceState.lastErrorMessages[deviceId] = e.message || 'Connection failed';
    }
}

export async function deregisterDevice(deviceId: string, token: string) {
	if (demoContext.isActive) {
		return demoDeregisterDevice(deviceId);
	}
	// Real implementation:
	return await v0Client.DELETE('/device/{deviceId}', {
		params: {
			path: { deviceId }
		},
		headers: { Authorization: `Bearer ${token}` }
	});
}

export async function removeUserFromDevice(deviceId: string, userId: string, token: string) {
	if (demoContext.isActive) {
		return { ok: true };
	}
	return await v0Client.DELETE('/device/{deviceId}/users/{userId}', {
		params: {
			path: { deviceId, userId }
		},
		headers: { Authorization: `Bearer ${token}` }
	});
}

export async function getCarList(deviceId: string, token: string) {
	if (demoContext.isActive) {
		return demoGetCarList();
	}
	try {
		const response = await v1Client.GET('/v1/settings/{deviceId}/values', {
			params: {
                path: { deviceId },
                query: { paramKeys: ['CarList'] }
            },
            headers: { Authorization: `Bearer ${token}` }
        });

        if (response.data?.items) {
            const carListParam = response.data.items.find((i) => i.key === 'CarList');
            if (carListParam) {
                const val = decodeParamValue(carListParam);
                if (typeof val === 'string') {
                    try {
                        return JSON.parse(val);
                    } catch (e) {
                        console.error('Failed to parse CarList JSON', e);
                        return null;
                    }
                }
                return val;
            }
        }
    } catch (e) {
        console.error(`Failed to fetch CarList for ${deviceId}`, e);
    }
    return null;
}

export async function setDeviceParams(
    deviceId: string,
    params: { key: string, value: any }[],
    token: string,
    timeoutMs: number = 20000 // Default 20s
) {
	if (demoContext.isActive) {
		return demoSetDeviceParams(deviceId, params);
	}
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort('Timeout'), timeoutMs);

    try {
        const res = await v0Client.POST('/settings/{deviceId}', {
            params: {
                path: { deviceId }
            },
            body: params,
            headers: { Authorization: `Bearer ${token}` },
            signal: controller.signal
        });
        console.log('[setDeviceParams] Response:', res);
        return res;
    } finally {
        clearTimeout(timeoutId);
    }
}
