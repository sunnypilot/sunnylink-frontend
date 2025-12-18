import { v1Client, v0Client } from '$lib/api/client';
import { deviceState } from '$lib/stores/device.svelte';
import type { ExtendedDeviceParamKey } from '$lib/types/settings';
import { decodeParamValue } from '$lib/utils/device';

const inflightConnectivities = new Map<string, Promise<void>>();
const inflightOffroadFetches = new Map<string, Promise<void>>();

const inflightStatusChecks = new Map<string, Promise<void>>();
const inflightSettingsFetches = new Map<string, Promise<void>>();

export async function checkDeviceStatus(deviceId: string, token: string) {
    if (!deviceId || !token) return;

    if (inflightStatusChecks.has(deviceId)) {
        return inflightStatusChecks.get(deviceId);
    }

    const promise = (async () => {
        deviceState.onlineStatuses[deviceId] = 'loading';

        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 5000); // 5s Strict Timeout

        try {
            // Fetch Offroad params directly. If this succeeds, device is Online.
            // If it times out or fails, device is Offline.
            // This avoids the 27s wait for the "settings keys" call.
            const valuesRes = await v1Client.GET('/v1/settings/{deviceId}/values', {
                params: {
                    path: { deviceId },
                    query: { paramKeys: ['IsOffroad', 'OffroadMode'] }
                },
                headers: { Authorization: `Bearer ${token}` },
                signal: controller.signal
            });

            if (valuesRes.data?.items) {
                deviceState.onlineStatuses[deviceId] = 'online';

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
                fetchDeviceSettings(deviceId, token);
            } else {
                // If we got a response but no items, technically online but maybe weird state?
                // Assume online if 200 OK.
                if (valuesRes.response.ok) {
                    deviceState.onlineStatuses[deviceId] = 'online';
                    fetchDeviceSettings(deviceId, token);
                } else {
                    deviceState.onlineStatuses[deviceId] = 'offline';
                }
            }
        } catch (e) {
            // AbortError -> Timeout
            console.error(`Status check failed for ${deviceId}`, e);
            deviceState.onlineStatuses[deviceId] = 'offline';
        } finally {
            clearTimeout(timeoutId);
            inflightStatusChecks.delete(deviceId);
        }
    })();

    inflightStatusChecks.set(deviceId, promise);
    return promise;
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

export async function getCarList(deviceId: string, token: string) {
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


export async function fetchDeviceSettings(deviceId: string, token: string) {
    if (inflightSettingsFetches.has(deviceId)) {
        return inflightSettingsFetches.get(deviceId);
    }

    const promise = (async () => {
        try {
            const settingsRes = await v1Client.GET('/v1/settings/{deviceId}', {
                params: {
                    path: { deviceId }
                },
                headers: { Authorization: `Bearer ${token}` }
            });

            if (settingsRes.data?.items && settingsRes.data.items.length > 0) {
                deviceState.deviceSettings[deviceId] = settingsRes.data.items as ExtendedDeviceParamKey[];
            }
        } catch (e) {
            console.error(`Failed to fetch settings for ${deviceId}`, e);
        } finally {
            inflightSettingsFetches.delete(deviceId);
        }
    })();

    inflightSettingsFetches.set(deviceId, promise);
    return promise;
}
