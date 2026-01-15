import { v1Client, v0Client } from '$lib/api/client';
import { deviceState } from '$lib/stores/device.svelte';
import type { ExtendedDeviceParamKey } from '$lib/types/settings';
import { decodeParamValue } from '$lib/utils/device';
import type { components } from '../../sunnylink/v1/schema';

type DeviceParam = components['schemas']['DeviceParam'];

export interface AsyncFetchResult {
	items: DeviceParam[] | null;
	error?: 'expired' | 'not_found' | 'timeout' | 'error';
}

export interface AsyncFetchOptions {
	maxPollTimeMs?: number; // Default 30s
	initialPollDelayMs?: number; // Default 100ms
	maxPollDelayMs?: number; // Default 1000ms
	signal?: AbortSignal;
}

/**
 * Fetches settings using the async endpoint with polling.
 *
 * Flow:
 * 1. Initiate async request → get request_id
 * 2. Poll until response ready (200), pending (204), not found (404), or gone (410)
 *
 * Note: Response is deleted after successful retrieval - caller must cache result.
 */
export async function fetchSettingsAsync(
	deviceId: string,
	paramKeys: string[],
	token: string,
	options: AsyncFetchOptions = {}
): Promise<AsyncFetchResult> {
	const {
		maxPollTimeMs = 30000,
		initialPollDelayMs = 100,
		maxPollDelayMs = 1000,
		signal
	} = options;

	try {
		// 1. Initiate async request
		const initRes = await v1Client.GET('/v1/settings/{deviceId}/async/values', {
			params: {
				path: { deviceId },
				query: { paramKeys }
			},
			headers: { Authorization: `Bearer ${token}` },
			signal
		});

		if (initRes.response.status === 404) {
			return { items: null, error: 'not_found' };
		}

		if (!initRes.data?.request_id) {
			return { items: null, error: 'error' };
		}

		const requestId = initRes.data.request_id;
		const expiresAt = initRes.data.expires_at ? new Date(initRes.data.expires_at).getTime() : null;

		// 2. Poll for result with exponential backoff until expiration
		// Note: Server returns 404 for privacy whether pending, not found, or expired
		// We poll until we get data, hit expiration, or max poll time
		const startTime = Date.now();
		let pollDelay = initialPollDelayMs;

		while (Date.now() - startTime < maxPollTimeMs) {
			if (signal?.aborted) {
				return { items: null, error: 'error' };
			}

			// Check if request has expired (use server's expiration time)
			if (expiresAt && Date.now() > expiresAt) {
				return { items: null, error: 'expired' };
			}

			// Wait before polling
			await new Promise((resolve) => setTimeout(resolve, pollDelay));

			const pollRes = await v1Client.GET('/v1/settings/{deviceId}/async/poll/{requestId}', {
				params: {
					path: { deviceId, requestId }
				},
				headers: { Authorization: `Bearer ${token}` },
				signal
			});

			const status = pollRes.response.status;

			if (status === 200 && pollRes.data?.items) {
				// Success - data is now deleted on server, must use locally
				return { items: pollRes.data.items };
			} else if (status === 204 || status === 404 || status === 410) {
				// All non-200 statuses: keep polling with backoff until expiration
				// Server uses 404 for privacy on all "not ready" states
				pollDelay = Math.min(pollDelay * 2, maxPollDelayMs);
				continue;
			} else {
				// Unexpected status (e.g. 401, 500) - error out
				return { items: null, error: 'error' };
			}
		}

		// Max poll time exceeded
		return { items: null, error: 'timeout' };
	} catch (e: unknown) {
		if ((e as { name?: string })?.name === 'AbortError' || signal?.aborted) {
			return { items: null, error: 'error' };
		}
		console.error(`Failed to fetch settings async for ${deviceId}:`, e);
		return { items: null, error: 'error' };
	}
}

export async function checkDeviceStatus(deviceId: string, token: string) {
	if (!deviceId || !token) return;

	deviceState.onlineStatuses[deviceId] = 'loading';

	try {
		// Phase 1: Fast synchronous check - query available settings keys to determine if online
		// This is a quick endpoint that tells us if the device is reachable
		const settingsRes = await v1Client.GET('/v1/settings/{deviceId}', {
			params: {
				path: { deviceId }
			},
			headers: { Authorization: `Bearer ${token}` }
		});

		if (settingsRes.error) {
			const status = settingsRes.response?.status || 500;
			if (status === 404) {
				deviceState.onlineStatuses[deviceId] = 'offline';
			} else {
				deviceState.onlineStatuses[deviceId] = 'error';
				deviceState.lastErrorMessages[deviceId] =
					settingsRes.error.detail || `Error ${status}`;
			}
			return;
		}

		// Strict check: Must have items and length > 0
		if (settingsRes.data?.items && settingsRes.data.items.length > 0) {
			deviceState.onlineStatuses[deviceId] = 'online';
			deviceState.deviceSettings[deviceId] = settingsRes.data.items as ExtendedDeviceParamKey[];
			// Clear any previous error
			delete deviceState.lastErrorMessages[deviceId];

			// Phase 2: Fire-and-forget async fetch for offroad values
			// This doesn't block the status check - we update state when it completes
			fetchOffroadStatus(deviceId, token);
		} else {
			// Empty items means we couldn't fetch settings -> likely offline or not ready
			deviceState.onlineStatuses[deviceId] = 'offline';
		}
	} catch (e: unknown) {
		console.error(`Failed to check status for ${deviceId}`, e);
		// Network errors or other exceptions are definitely errors, not just "offline"
		deviceState.onlineStatuses[deviceId] = 'error';
		deviceState.lastErrorMessages[deviceId] =
			(e as { message?: string })?.message || 'Connection failed';
	}
}

/**
 * Fetches offroad status asynchronously without blocking.
 * Updates deviceState when complete.
 */
async function fetchOffroadStatus(deviceId: string, token: string) {
	try {
		const valuesRes = await fetchSettingsAsync(deviceId, ['IsOffroad', 'OffroadMode'], token);

		if (valuesRes.items) {
			const isOffroadParam = valuesRes.items.find((i) => i.key === 'IsOffroad');
			const offroadModeParam = valuesRes.items.find((i) => i.key === 'OffroadMode');

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
	} catch (e) {
		console.error(`Failed to fetch offroad status for ${deviceId}`, e);
		// Don't update device status - it's already marked as online from phase 1
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

export async function getCarList(deviceId: string, token: string) {
	try {
		const response = await fetchSettingsAsync(deviceId, ['CarList'], token);

		if (response.items) {
			const carListParam = response.items.find((i) => i.key === 'CarList');
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
	params: { key: string; value: any; is_compressed?: boolean }[],
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
