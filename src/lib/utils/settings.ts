import {
	SETTINGS_DEFINITIONS,
	type RenderableSetting,
	type SettingCategory,
	type ExtendedDeviceParamKey
} from '$lib/types/settings';

import { browser } from '$app/environment';

function getEffectiveDefinitions(): import('$lib/types/settings').SettingDefinition[] {
	if (!browser) return SETTINGS_DEFINITIONS;

	try {
		const stored = localStorage.getItem('sunnylink_custom_definitions');
		if (!stored) return SETTINGS_DEFINITIONS;

		const parsed = JSON.parse(stored);
		const storedMap = new Map(parsed.map((d: any) => [d.key, d]));

		// 1. Merge overrides for existing defaults
		const merged = SETTINGS_DEFINITIONS.map((def) => {
			const storedDef = storedMap.get(def.key);
			return storedDef ? (storedDef as import('$lib/types/settings').SettingDefinition) : def;
		});

		// 2. Add any purely new definitions from storage that aren't in defaults
		const defaultKeys = new Set(SETTINGS_DEFINITIONS.map((d) => d.key));
		for (const def of parsed) {
			if (!defaultKeys.has(def.key)) {
				merged.push(def);
			}
		}

		return merged;
	} catch (e) {
		console.error('Failed to load custom definitions', e);
		return SETTINGS_DEFINITIONS;
	}
}

export function getAllSettings(
	settings: ExtendedDeviceParamKey[] | undefined,
	showHidden: boolean = false,
	returnSections: boolean = true
): RenderableSetting[] {
	// 1. Get all effective definitions (defaults + user overrides)
	const explicitDefs = getEffectiveDefinitions();

	// 2. Find dynamic settings from device
	let dynamicDefs: RenderableSetting[] = [];
	if (settings) {
		const definedKeys = new Set(explicitDefs.map((d) => d.key));
		dynamicDefs = settings
			.filter((s) => s.key && !definedKeys.has(s.key))
			.map((s) => {
				let decodedValue = s;
				if (s.default_value) {
					try {
						decodedValue = { ...s };
						decodedValue.default_value = atob(s.default_value);
					} catch (e) {
						console.warn(`Failed to decode default value for ${s.key}`, e);
					}
				}
				return {
					key: s.key!,
					label: s.key!,
					description: 'Unknown setting from device',
					category: 'other' as SettingCategory,
					value: decodedValue,
					_extra: s._extra,
					advanced: false,
					readonly: false,
					hidden: false
				};
			});
	}

	// 3. Combine and map values
	const allDefs = [...explicitDefs, ...dynamicDefs];

	return (
		allDefs
			.map((def) => {
				const settingValue = settings?.find((s) => s.key === def.key);
				let decodedValue = settingValue;

				if (settingValue?.default_value) {
					try {
						decodedValue = { ...settingValue };
						decodedValue.default_value = atob(settingValue.default_value);
					} catch (e) {
						console.warn(`Failed to decode default value for ${def.key}`, e);
					}
				} else if ((def as unknown as RenderableSetting).value) {
					decodedValue = (def as unknown as RenderableSetting).value;
				}

				return {
					...def,
					_extra: settingValue?._extra,
					value: decodedValue
				};
			})
			// Filter out those that have no value AND no default value?
			// Keeping consistent with original logic: show if we have a value (from device or default).
			.filter((s) => s.value !== undefined || s.isSection)
			.filter((s) => showHidden || !s.hidden)
			.filter((s) => returnSections || !s.isSection)
	);
}

export interface UnavailableSetting {
	key: string;
	reason: string;
}

export interface DeviceSettingsBackup {
	version: number;
	timestamp: number;
	deviceId: string;
	settings: Record<string, any>;
	unavailable_settings?: UnavailableSetting[];
}

export interface FetchAllSettingsResult {
	settings: Record<string, unknown>;
	failedKeys: UnavailableSetting[];
}

export const BACKUP_EXCLUDED_KEYS = new Set([
	// Heavy cache data (regenerated automatically)
	'ModelManager_ModelsCache',
	'ModelRunnerTypeCache',
	'LagdValueCache',
	'ApiCache_DriveStats',
	'ApiCache_Device',
	'ApiCache_NavDestinations',
	'ApiCache_FirehoseStats',
	'SunnylinkCache_Users',
	'SunnylinkCache_Roles',
	'AthenadRecentlyViewedRoutes',
	// CarParams — device-specific hardware data
	'CarList',
	'CarParams',
	'CarParamsCache',
	'CarParamsSP',
	'CarParamsSPCache',
	'CarParamsPrevRoute',
	'CarParamsPersistent',
	'CarParamsSPPersistent',
	// Live/ephemeral data
	'LiveTorqueParameters',
	'LiveParameters',
	'LiveParametersV2',
	'CalibrationParams',
	'LocationFilterInitialState',
	// Updater state (ephemeral)
	'UpdaterAvailableBranches',
	'UpdaterCurrentDescription',
	'UpdaterCurrentReleaseNotes',
	'UpdaterNewDescription',
	'UpdaterNewReleaseNotes',
	'UpdaterFetchAvailable',
	'UpdaterState',
	'UpdaterLastFetchTime',
	// Runtime counters / device state
	'CarBatteryCapacity',
	'GitCommit',
	'GitCommitDate',
	// Boot and uptime tracking
	'BootCount',
	'CurrentBootlog',
	'UptimeOnroad',
	'UptimeOffroad',
	// Route tracking
	'RouteCount',
	'CurrentRoute',
	// Last update tracking
	'LastUpdateException',
	'LastUpdateTime',
	'LastUpdateRouteCount',
	'LastUpdateUptimeOnroad',
	// Panda hardware state
	'PandaHeartbeatLost',
	'PandaSomResetTriggered',
	'PandaSignatures',
	// Process PIDs
	'AthenadPid',
	'SunnylinkdPid'
]);

export function getBackupKeys(deviceSettings?: ExtendedDeviceParamKey[]): string[] {
	const defsMap = new Map(SETTINGS_DEFINITIONS.map((d) => [d.key, d]));

	let keys: string[];
	if (deviceSettings && deviceSettings.length > 0) {
		// Use only device-reported keys — the device knows what it has
		keys = deviceSettings.map((s) => s.key).filter((k): k is string => k !== undefined);
	} else {
		// Fallback to static definitions
		keys = SETTINGS_DEFINITIONS.map((d) => d.key);
	}

	// Filter out section markers and explicitly excluded keys
	return keys.filter((key) => {
		if (BACKUP_EXCLUDED_KEYS.has(key)) return false;
		if (key.startsWith('_sec_')) return false;
		const def = defsMap.get(key);
		if (def?.isSection) return false;
		return true;
	});
}

export function downloadSettingsBackup(
	deviceId: string,
	settings: Record<string, any>,
	unavailableSettings?: UnavailableSetting[]
) {
	const backup: DeviceSettingsBackup = {
		version: 2,
		timestamp: Date.now(),
		deviceId,
		settings,
		...(unavailableSettings && unavailableSettings.length > 0
			? { unavailable_settings: unavailableSettings }
			: {})
	};

	const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' });
	const url = URL.createObjectURL(blob);
	const a = document.createElement('a');
	a.href = url;
	a.download = `sunnylink-settings-${deviceId}-${new Date().toISOString().split('T')[0]}.json`;
	document.body.appendChild(a);
	a.click();
	document.body.removeChild(a);
	URL.revokeObjectURL(url);
}

import { decodeParamValue } from '$lib/utils/device';
import { fetchSettingsAsync } from '$lib/api/device';

export async function fetchAllSettings(
	deviceId: string,
	_client: unknown,
	token: string,
	currentValues: Record<string, unknown>,
	onProgress?: (progress: number, status: string) => void,
	signal?: AbortSignal,
	deviceSettings?: ExtendedDeviceParamKey[],
	keysOverride?: string[]
): Promise<FetchAllSettingsResult> {
	// 1. Get keys to fetch — use override (for retry), device-reported, or static fallback
	const keysToFetch = keysOverride ?? getBackupKeys(deviceSettings);

	// 2. Filter out keys we already have (unless retrying specific keys)
	const missingKeys = keysOverride
		? keysOverride
		: keysToFetch.filter((key) => currentValues[key] === undefined);

	if (missingKeys.length === 0) {
		onProgress?.(100, 'All settings up to date');
		return { settings: currentValues, failedKeys: [] };
	}

	// 3. Fetch missing values in chunks
	const newValues = { ...currentValues };
	const chunkedKeys: string[][] = [];
	for (let i = 0; i < missingKeys.length; i += 10) {
		chunkedKeys.push(missingKeys.slice(i, i + 10));
	}

	let processedCount = 0;
	const totalCount = missingKeys.length;
	let successCount = 0;
	const failedKeys: UnavailableSetting[] = [];

	const CONCURRENCY = 3;
	const MAX_RETRIES = 1;

	async function fetchChunk(chunk: string[]): Promise<void> {
		if (signal?.aborted) return;

		let lastError: unknown;
		let lastReason = 'unknown';
		for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
			if (signal?.aborted) return;

			try {
				const response = await fetchSettingsAsync(deviceId, chunk, token, { signal });

				if (response.items) {
					for (const item of response.items) {
						if (item.key && item.value !== undefined) {
							const def = SETTINGS_DEFINITIONS.find((d) => d.key === item.key);
							const type =
								(def as unknown as { value?: { type?: string } })?.value?.type ?? 'String';

							newValues[item.key] = decodeParamValue({
								key: item.key,
								value: item.value,
								type: type as
									| 'String'
									| 'Bool'
									| 'Int'
									| 'Float'
									| 'Time'
									| 'Json'
									| 'Bytes'
									| 'Unknown'
									| undefined
							});
						}
					}
					successCount += chunk.length;
					return;
				} else {
					lastReason = response.error ?? 'no_items_returned';
					lastError = new Error(lastReason);
				}
			} catch (e: unknown) {
				if ((e as { name?: string })?.name === 'AbortError' || signal?.aborted) {
					return;
				}
				lastReason = 'network_error';
				lastError = e;
			}

			// Wait before retry
			if (attempt < MAX_RETRIES) {
				await new Promise((r) => setTimeout(r, 1000 * (attempt + 1)));
			}
		}

		console.error(
			`Failed to fetch chunk for ${deviceId} after ${MAX_RETRIES + 1} attempts`,
			lastError
		);
		for (const key of chunk) {
			failedKeys.push({ key, reason: lastReason });
		}
	}

	// Process chunks with proper concurrency limiting
	const activePromises = new Set<Promise<void>>();

	for (const chunk of chunkedKeys) {
		if (signal?.aborted) {
			throw new Error('Backup cancelled');
		}

		const p = fetchChunk(chunk);
		const tracked = p.then(() => {
			activePromises.delete(tracked);
			if (!signal?.aborted) {
				processedCount += chunk.length;
				onProgress?.(
					(processedCount / totalCount) * 100,
					`Processed ${processedCount} of ${totalCount} settings...`
				);
			}
		});

		activePromises.add(tracked);

		if (activePromises.size >= CONCURRENCY) {
			await Promise.race(activePromises);
		}
	}

	// Wait for all remaining
	await Promise.all(activePromises);

	if (signal?.aborted) {
		throw new Error('Backup cancelled');
	}

	if (failedKeys.length > 0) {
		onProgress?.(100, `Completed with ${failedKeys.length} failed settings.`);
	} else {
		onProgress?.(100, 'Finalizing backup...');
	}

	return { settings: newValues, failedKeys };
}

export function parseSettingsBackup(json: string): DeviceSettingsBackup {
	try {
		const parsed = JSON.parse(json);
		if (!parsed.version || !parsed.settings) {
			throw new Error('Invalid backup format');
		}
		return parsed as DeviceSettingsBackup;
	} catch (e) {
		throw new Error('Failed to parse settings backup file');
	}
}
