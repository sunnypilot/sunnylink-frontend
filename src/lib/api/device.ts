import { v1Client, v0Client, API_BASE_URL, customFetch } from '$lib/api/client';
import { deviceState } from '$lib/stores/device.svelte';
import type { ExtendedDeviceParamKey } from '$lib/types/settings';
import { decodeParamValue } from '$lib/utils/device';
import { decodeCompressedJson } from '$lib/utils/compression';
import type { components } from '../../sunnylink/v1/schema';

type DeviceParam = components['schemas']['DeviceParam'];
type ParamType = components['schemas']['ParamType'];

export interface AsyncFetchResult {
	items: DeviceParam[] | null;
	error?: 'expired' | 'not_found' | 'timeout' | 'error';
}

export interface AsyncFetchOptions {
	maxPollTimeMs?: number; // Default 30s
	initialPollDelayMs?: number; // Default 500ms
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
		initialPollDelayMs = 500,
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

/** Maps device-side ParamKeyType enum values to frontend ParamType strings. */
const PARAM_TYPE_NAMES: Record<number, ParamType> = {
	0: 'String',
	1: 'Bool',
	2: 'Int',
	3: 'Float',
	4: 'Time',
	5: 'Json',
	6: 'Bytes'
};

/**
 * Fetches compressed settings from the device via the paramsMetadata endpoint.
 *
 * Returns the same struct as getParamsAllKeysV1 (keys + types + defaults + _extra),
 * but gzip-compressed for ~80% bandwidth reduction. The device sends type as an integer
 * enum; this function maps it to the string form the frontend expects.
 *
 * Returns null if the device does not support this endpoint (404/500),
 * indicating the caller should fall back to legacy getParamsAllKeysV1.
 */
export async function fetchParamsMetadata(
	deviceId: string,
	token: string
): Promise<ExtendedDeviceParamKey[] | null> {
	const response = await customFetch(
		`${API_BASE_URL}/v1/settings/${encodeURIComponent(deviceId)}/paramsMetadata`,
		{
			headers: { Authorization: `Bearer ${token}` }
		}
	);

	if (!response.ok) {
		// Device doesn't support getParamsMetadata — fall back to V1
		return null;
	}

	const json: { params_metadata: string } = await response.json();
	const items = await decodeCompressedJson<ExtendedDeviceParamKey[]>(json.params_metadata);

	// Map integer type enum to ParamType string (device sends raw enum, backend does this for V1)
	return items.map((item) => ({
		...item,
		type:
			typeof item.type === 'number'
				? (PARAM_TYPE_NAMES[item.type as number] ?? ('Unknown' as ParamType))
				: item.type
	}));
}

/**
 * Fetches deviceState cereal message via v0 getMessage proxy.
 * Returns the deviceState object or null on failure.
 *
 * This is a single synchronous RPC — no polling. Proves device connectivity,
 * and provides offroad status (started), network info, thermals, and more.
 */
export async function fetchDeviceMessage(
	deviceId: string,
	token: string
): Promise<Record<string, unknown> | null> {
	const response = await customFetch(
		`${API_BASE_URL}/ws/${encodeURIComponent(deviceId)}/message?service=deviceState`,
		{
			headers: { Authorization: `Bearer ${token}` }
		}
	);

	if (!response.ok) {
		// Device unreachable via getMessage — not necessarily offline
		return null;
	}

	const data = await response.json();
	return data?.deviceState ?? null;
}

/**
 * Fetches OffroadMode (force offroad) via synchronous values endpoint.
 * Returns the decoded boolean or null on failure.
 */
async function fetchForceOffroadStatus(deviceId: string, token: string): Promise<boolean | null> {
	try {
		const res = await v1Client.GET('/v1/settings/{deviceId}/values', {
			params: {
				path: { deviceId },
				query: { paramKeys: ['OffroadMode'] }
			},
			headers: { Authorization: `Bearer ${token}` }
		});

		if (res.data?.items) {
			const param = res.data.items.find((i) => i.key === 'OffroadMode');
			if (param) {
				const val = decodeParamValue(param);
				return val === '1' || val === 1 || val === true || val === 'true';
			}
		}
		return false;
	} catch (e) {
		console.error(`Failed to fetch OffroadMode for ${deviceId}:`, e);
		return null;
	}
}

/**
 * Checks device status in two phases:
 *
 * Phase 1 (parallel): getMessage + getParamsMetadata + OffroadMode
 *   - getMessage proves connectivity + offroad + telemetry
 *   - getParamsMetadata returns compressed settings (same struct as V1)
 *   - OffroadMode for force-offroad status
 *
 * Phase 2 (fallback, only if metadata 404 + device online):
 *   - getParamsAllKeysV1 — uncompressed legacy, slower
 *   - Incentivizes users to update to latest sunnypilot
 */
export async function checkDeviceStatus(deviceId: string, token: string) {
	if (!deviceId || !token) return;

	deviceState.onlineStatuses[deviceId] = 'loading';

	try {
		// Phase 1: getMessage + getParamsMetadata + OffroadMode in parallel
		const [messageResult, metadataResult, forceOffroadResult] = await Promise.allSettled([
			fetchDeviceMessage(deviceId, token),
			fetchParamsMetadata(deviceId, token),
			fetchForceOffroadStatus(deviceId, token)
		]);

		const deviceMessage = messageResult.status === 'fulfilled' ? messageResult.value : null;
		const compressedSettings = metadataResult.status === 'fulfilled' ? metadataResult.value : null;
		const forceOffroad =
			forceOffroadResult.status === 'fulfilled' ? forceOffroadResult.value : null;

		// Check if any call had a network/auth error (rejected) vs endpoint not supported (fulfilled null)
		const hasNetworkError =
			messageResult.status === 'rejected' || metadataResult.status === 'rejected';

		// Determine online status
		if (deviceMessage === null && compressedSettings === null) {
			if (hasNetworkError) {
				// Network/auth failure — show error, not offline
				deviceState.onlineStatuses[deviceId] = 'error';
				const reason =
					messageResult.status === 'rejected'
						? (messageResult.reason as Error)?.message
						: (metadataResult as PromiseRejectedResult).reason?.message;
				deviceState.lastErrorMessages[deviceId] = reason || 'Connection failed';
			} else {
				// Both returned null (HTTP error responses) — device is offline
				deviceState.onlineStatuses[deviceId] = 'offline';
			}
			return;
		}

		// Device is online
		deviceState.onlineStatuses[deviceId] = 'online';
		delete deviceState.lastErrorMessages[deviceId];

		// Store offroad from getMessage (started is always present in cereal deviceState)
		if (deviceMessage !== null) {
			const started = (deviceMessage.started as boolean) ?? false;
			deviceState.offroadStatuses[deviceId] = {
				isOffroad: !started,
				forceOffroad: forceOffroad ?? false
			};

			deviceState.deviceTelemetry[deviceId] = {
				started,
				networkType: (deviceMessage.networkType as string) ?? 'unknown',
				networkMetered: (deviceMessage.networkMetered as boolean) ?? false,
				freeSpacePercent: (deviceMessage.freeSpacePercent as number) ?? 0,
				thermalStatus: (deviceMessage.thermalStatus as string) ?? 'unknown',
				maxTempC: (deviceMessage.maxTempC as number) ?? 0,
				deviceType: (deviceMessage.deviceType as string) ?? 'unknown'
			};
		} else {
			deviceState.offroadStatuses[deviceId] = {
				isOffroad: false,
				forceOffroad: forceOffroad ?? false
			};
		}

		// Store settings from compressed metadata (primary)
		if (compressedSettings !== null) {
			deviceState.deviceSettings[deviceId] = compressedSettings;
			return;
		}

		// Metadata failed — log reason for debugging (data corruption vs unsupported endpoint)
		if (metadataResult.status === 'rejected') {
			console.warn(
				`[checkDeviceStatus] getParamsMetadata rejected for ${deviceId}, falling back to V1:`,
				metadataResult.reason
			);
		} else {
			console.warn(
				`[checkDeviceStatus] getParamsMetadata returned null for ${deviceId}, falling back to V1`
			);
		}

		// Phase 2: Fallback to legacy V1 (old device without getParamsMetadata)
		const settingsRes = await v1Client.GET('/v1/settings/{deviceId}', {
			params: { path: { deviceId } },
			headers: { Authorization: `Bearer ${token}` }
		});

		if (!settingsRes.error && settingsRes.data?.items && settingsRes.data.items.length > 0) {
			deviceState.deviceSettings[deviceId] = settingsRes.data.items as ExtendedDeviceParamKey[];
		}
	} catch (e: unknown) {
		console.error(`Failed to check status for ${deviceId}`, e);
		deviceState.onlineStatuses[deviceId] = 'error';
		deviceState.lastErrorMessages[deviceId] =
			(e as { message?: string })?.message || 'Connection failed';
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
