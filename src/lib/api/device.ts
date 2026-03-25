import { v1Client, v0Client, API_BASE_URL, customFetch } from '$lib/api/client';
import { deviceState } from '$lib/stores/device.svelte';
import { schemaState } from '$lib/stores/schema.svelte';
import type { ExtendedDeviceParamKey } from '$lib/types/settings';
import { decodeParamValue } from '$lib/utils/device';
import { decodeCompressedJson } from '$lib/utils/compression';
import type { SettingsSchema } from '$lib/types/schema';
import type { components } from '../../sunnylink/v1/schema';

type DeviceParam = components['schemas']['DeviceParam'];
type ParamType = components['schemas']['ParamType'];

/** Maps raw JS error messages to user-friendly text */
function friendlyErrorMessage(raw: string | undefined): string {
	if (!raw) return 'Connection failed';
	const lower = raw.toLowerCase();
	if (lower.includes('abort') || lower.includes('signal')) return 'Device did not respond in time';
	if (lower.includes('timeout')) return 'Connection timed out';
	if (lower.includes('network') || lower.includes('fetch'))
		return 'Network error — check your connection';
	if (lower.includes('401') || lower.includes('unauthorized'))
		return 'Session expired — please sign in again';
	if (lower.includes('403') || lower.includes('forbidden')) return 'Access denied';
	if (lower.includes('404') || lower.includes('not found')) return 'Device not found';
	if (lower.includes('502') || lower.includes('503') || lower.includes('504'))
		return 'Server temporarily unavailable';
	return raw;
}

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
 * Fetches the SettingsSchema from the device via the paramsMetadata endpoint.
 *
 * The device generates the schema from settings_ui.json (with flattened
 * sections, capability_fields, etc.) and returns it gzip+base64 compressed.
 *
 * Returns null if the device does not support this endpoint (404/500),
 * indicating the caller should fall back to legacy getParamsAllKeysV1.
 */
export async function fetchParamsMetadata(
	deviceId: string,
	token: string
): Promise<SettingsSchema | null> {
	const controller = new AbortController();
	const timeoutId = setTimeout(() => controller.abort('paramsMetadata timeout'), 15_000);

	try {
		const response = await customFetch(
			`${API_BASE_URL}/v1/settings/${encodeURIComponent(deviceId)}/paramsMetadata`,
			{
				headers: { Authorization: `Bearer ${token}` },
				signal: controller.signal
			}
		);

		if (!response.ok) {
			return null;
		}

		const json = await response.json();
		if (typeof json?.params_metadata !== 'string') {
			console.error(`getParamsMetadata: missing or invalid params_metadata field`);
			return null;
		}
		const schema = await decodeCompressedJson<SettingsSchema>(json.params_metadata);

		if (!schema?.panels?.length) {
			console.warn(
				`getParamsMetadata: schema has no panels for ${deviceId}, treating as unavailable`
			);
			return null;
		}
		return schema;
	} catch (e) {
		if ((e as { name?: string })?.name === 'AbortError') return null;
		console.error(`getParamsMetadata: data parsing failed for ${deviceId}:`, e);
		return null;
	} finally {
		clearTimeout(timeoutId);
	}
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
	const controller = new AbortController();
	const timeoutId = setTimeout(() => controller.abort('getMessage timeout'), 15_000);

	try {
		const response = await customFetch(
			`${API_BASE_URL}/ws/${encodeURIComponent(deviceId)}/message?service=deviceState`,
			{
				headers: { Authorization: `Bearer ${token}` },
				signal: controller.signal
			}
		);

		if (!response.ok) {
			return null;
		}

		const data = await response.json();
		return data?.deviceState ?? null;
	} catch (e) {
		if ((e as { name?: string })?.name === 'AbortError') return null;
		console.error(`fetchDeviceMessage: failed for ${deviceId}:`, e);
		return null;
	} finally {
		clearTimeout(timeoutId);
	}
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
export async function checkDeviceStatus(
	deviceId: string,
	token: string,
	force: boolean = false,
	silent: boolean = false
) {
	if (!deviceId || !token) return;

	// Skip if we have a fresh status (< 60s old) and not forcing
	if (!force && deviceState.isStatusFresh(deviceId)) return;

	// Only show 'loading' when device status is genuinely unknown.
	// Never regress from 'online' to 'loading' — a re-check of an already-online
	// device shouldn't flash "Connecting..." in the UI.
	if (!silent) {
		const current = deviceState.onlineStatuses[deviceId];
		if (current !== 'online') {
			deviceState.onlineStatuses[deviceId] = 'loading';
		}
	}

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
				deviceState.lastErrorMessages[deviceId] = friendlyErrorMessage(reason);
			} else {
				// Both returned null (HTTP error responses) — device is offline
				deviceState.onlineStatuses[deviceId] = 'offline';
			}
			deviceState.markStatusChecked(deviceId);
			return;
		}

		// Device is online
		deviceState.onlineStatuses[deviceId] = 'online';
		deviceState.lastSeenOnline[deviceId] = Date.now();
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
		} else if (forceOffroad !== null) {
			deviceState.offroadStatuses[deviceId] = {
				isOffroad: deviceState.offroadStatuses[deviceId]?.isOffroad ?? true,
				forceOffroad
			};
		} else if (!deviceState.offroadStatuses[deviceId]) {
			// Device online but getMessage unavailable — default to offroad (safe/common state)
			deviceState.offroadStatuses[deviceId] = {
				isOffroad: true,
				forceOffroad: false
			};
		}

		// Fetch basic device info params (GitBranch, GitCommit) for Dashboard/popover display.
		// Fire-and-forget — don't block status check completion.
		const infoKeys = ['GitBranch', 'GitCommit', 'Version'];
		const existingValues = deviceState.deviceValues[deviceId] ?? {};
		const missingInfoKeys = infoKeys.filter((k) => existingValues[k] === undefined);
		if (missingInfoKeys.length > 0) {
			fetchSettingsAsync(deviceId, missingInfoKeys, token)
				.then((result) => {
					if (result.items) {
						const vals = (deviceState.deviceValues[deviceId] ??= {});
						for (const item of result.items) {
							if (item.key && item.value !== undefined) {
								vals[item.key] = decodeParamValue({
									key: item.key,
									value: item.value,
									type: item.type ?? 'String'
								});
							}
						}
					}
				})
				.catch(() => {
					/* non-critical — silent fail */
				});
		}

		// Store schema from compressed metadata (primary path for new devices)
		// Only update if schema structure actually changed to avoid re-triggering derived state.
		if (compressedSettings !== null) {
			const existing = schemaState.schemas[deviceId];
			if (
				!existing ||
				JSON.stringify(existing.panels) !== JSON.stringify(compressedSettings.panels) ||
				JSON.stringify(existing.vehicle_settings) !==
					JSON.stringify(compressedSettings.vehicle_settings)
			) {
				schemaState.schemas[deviceId] = compressedSettings;
			}
			deviceState.markStatusChecked(deviceId);
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
		deviceState.markStatusChecked(deviceId);
	} catch (e: unknown) {
		console.error(`Failed to check status for ${deviceId}`, e);
		deviceState.onlineStatuses[deviceId] = 'error';
		deviceState.lastErrorMessages[deviceId] = friendlyErrorMessage(
			(e as { message?: string })?.message
		);
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

export class DeviceRejectionError extends Error {
	status: number;
	constructor(message: string, status: number) {
		super(message);
		this.name = 'DeviceRejectionError';
		this.status = status;
	}
}

export async function setDeviceParams(
	deviceId: string,
	params: { key: string; value: any; is_compressed?: boolean }[],
	token: string,
	timeoutMs: number = 20000
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

		if (res.response && !res.response.ok) {
			const status = res.response.status;
			const detail = (res.error as any)?.detail || res.response.statusText || 'Unknown error';
			if (status >= 400 && status < 500) {
				throw new DeviceRejectionError(detail, status);
			}
			throw new Error(`Server error (${status}): ${detail}`);
		}

		return res;
	} finally {
		clearTimeout(timeoutId);
	}
}
