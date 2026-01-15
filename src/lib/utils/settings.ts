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
	showAdvanced: boolean = false,
	showHidden: boolean = false
): RenderableSetting[] {
	// 1. Get all effective definitions (defaults + user overrides)
	const explicitDefs = getEffectiveDefinitions();

	// 2. Find dynamic settings from device
	let dynamicDefs: RenderableSetting[] = [];
	if (settings) {
		const definedKeys = new Set(SETTINGS_DEFINITIONS.map((d) => d.key));
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
			.filter((s) => showAdvanced || !s.advanced)
	);
}

export interface DeviceSettingsBackup {
	version: number;
	timestamp: number;
	deviceId: string;
	settings: Record<string, any>;
}

export function downloadSettingsBackup(deviceId: string, settings: Record<string, any>) {
	const backup: DeviceSettingsBackup = {
		version: 1,
		timestamp: Date.now(),
		deviceId,
		settings
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
	signal?: AbortSignal
): Promise<Record<string, unknown>> {
	// 1. Get all known keys
	const explicitKeys = SETTINGS_DEFINITIONS.map((d) => d.key);

	// 2. Get dynamic keys if available in store (passed as part of currentValues or we assume caller handles definitions)
	// Ideally we should fetch definitions first if we want to be 100% sure, but for now let's rely on definitions being loaded
	// or just fetch what we know.
	// Actually, let's fetch definitions to be safe if we can, but that requires more deps.
	// Let's stick to SETTINGS_DEFINITIONS for now as that covers most.
	// If we want dynamic ones, we should rely on what's in deviceState.deviceSettings.

	const keysToFetch = [...explicitKeys]; // Add dynamic ones if we can access them here

	// 3. Filter out keys we already have
	const missingKeys = keysToFetch.filter((key) => currentValues[key] === undefined);

	if (missingKeys.length === 0) {
		onProgress?.(100, 'All settings up to date');
		return currentValues;
	}

	// 4. Fetch missing values in chunks
	const newValues = { ...currentValues };
	const chunkedKeys = [];
	for (let i = 0; i < missingKeys.length; i += 10) {
		chunkedKeys.push(missingKeys.slice(i, i + 10));
	}

	let processedCount = 0;
	const totalCount = missingKeys.length;
	let successCount = 0;
	let failCount = 0;

	// Process in chunks with limited concurrency to avoid overwhelming the device/connection
	// but faster than sequential.
	const CONCURRENCY = 3;
	const activePromises: Promise<void>[] = [];

	for (const chunk of chunkedKeys) {
		if (signal?.aborted) {
			throw new Error('Backup cancelled');
		}

		const promise = (async () => {
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
				} else {
					failCount += chunk.length;
				}
			} catch (e: unknown) {
				if ((e as { name?: string })?.name === 'AbortError' || signal?.aborted) {
					// Ignore abort errors
					return;
				}
				console.error(`Failed to fetch chunk for ${deviceId}`, e);
				failCount += chunk.length;
			} finally {
				if (!signal?.aborted) {
					processedCount += chunk.length;
					onProgress?.(
						(processedCount / totalCount) * 100,
						`Processed ${processedCount} of ${totalCount} settings...`
					);
					// Small delay to let UI breathe
					await new Promise((r) => setTimeout(r, 10));
				}
			}
		})();

		activePromises.push(promise);

		if (activePromises.length >= CONCURRENCY) {
			await Promise.race(activePromises);
		}
	}

	// Wait for all remaining
	await Promise.all(activePromises);

	if (signal?.aborted) {
		throw new Error('Backup cancelled');
	}

	if (failCount > 0) {
		onProgress?.(100, `Completed with ${failCount} errors.`);
		// Give user time to see the error
		await new Promise((r) => setTimeout(r, 1000));
	} else {
		onProgress?.(100, 'Finalizing backup...');
	}

	return newValues;
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
