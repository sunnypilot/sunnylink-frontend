
import {
    SETTINGS_DEFINITIONS,
    type RenderableSetting,
    type SettingCategory,
    type ExtendedDeviceParamKey
} from '$lib/types/settings';

export function getAllSettings(
    settings: ExtendedDeviceParamKey[] | undefined,
    showAdvanced: boolean = false
): RenderableSetting[] {
    // 1. Get all explicit definitions
    const explicitDefs = SETTINGS_DEFINITIONS;

    // 2. Create a Map for O(1) lookups of settings by key
    const settingsMap = new Map<string, ExtendedDeviceParamKey>();
    if (settings) {
        for (const setting of settings) {
            if (setting.key) {
                settingsMap.set(setting.key, setting);
            }
        }
    }

    // 3. Build defined keys Set for O(1) lookups
    const definedKeys = new Set(SETTINGS_DEFINITIONS.map((d) => d.key));

    // 4. Find dynamic settings from device
    let dynamicDefs: RenderableSetting[] = [];
    if (settings) {
        for (const s of settings) {
            if (s.key && !definedKeys.has(s.key)) {
                let decodedValue = s;
                if (s.default_value) {
                    try {
                        decodedValue = { ...s };
                        decodedValue.default_value = atob(s.default_value);
                    } catch (e) {
                        console.warn(`Failed to decode default value for ${s.key}`, e);
                    }
                }
                dynamicDefs.push({
                    key: s.key,
                    label: s.key,
                    description: 'Unknown setting from device',
                    category: 'other' as SettingCategory,
                    value: decodedValue,
                    _extra: s._extra,
                    advanced: false,
                    readonly: false,
                    hidden: false
                });
            }
        }
    }

    // 5. Combine and map values in a single pass with filtering
    const result: RenderableSetting[] = [];
    const allDefs = [...explicitDefs, ...dynamicDefs];

    for (const def of allDefs) {
        // Skip hidden settings early
        if (def.hidden) continue;
        
        // Skip advanced settings if not showing them
        if (!showAdvanced && def.advanced) continue;

        const settingValue = settingsMap.get(def.key);
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

        // Skip if no value
        if (decodedValue === undefined) continue;

        result.push({
            ...def,
            _extra: settingValue?._extra,
            value: decodedValue
        });
    }

    return result;
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

export async function fetchAllSettings(
    deviceId: string,
    client: any,
    token: string,
    currentValues: Record<string, any>,
    onProgress?: (progress: number, status: string) => void,
    signal?: AbortSignal
): Promise<Record<string, any>> {
    // 1. Get all known keys
    const explicitKeys = SETTINGS_DEFINITIONS.map(d => d.key);
    const keysToFetch = [...explicitKeys];

    // 2. Filter out keys we already have
    const missingKeys = keysToFetch.filter(key => currentValues[key] === undefined);

    if (missingKeys.length === 0) {
        onProgress?.(100, 'All settings up to date');
        return currentValues;
    }

    // 3. Build a Map for O(1) type lookups
    const typeMap = new Map<string, string>();
    for (const def of SETTINGS_DEFINITIONS) {
        typeMap.set(def.key, 'String'); // Default type
    }

    // 4. Fetch missing values in chunks with optimized concurrency
    const newValues = { ...currentValues };
    const chunkSize = 10;
    let processedCount = 0;
    const totalCount = missingKeys.length;
    let failCount = 0;

    const CONCURRENCY = 3;
    const activePromises = new Set<Promise<void>>();

    for (let i = 0; i < missingKeys.length; i += chunkSize) {
        if (signal?.aborted) {
            throw new Error('Backup cancelled');
        }

        const chunk = missingKeys.slice(i, i + chunkSize);
        
        const promise = (async () => {
            try {
                if (signal?.aborted) return;

                const response = await client.GET('/v1/settings/{deviceId}/values', {
                    params: {
                        path: { deviceId },
                        query: { paramKeys: chunk }
                    },
                    headers: { Authorization: `Bearer ${token}` },
                    signal
                });

                if (response.data?.items) {
                    for (const item of response.data.items) {
                        if (item.key && item.value !== undefined) {
                            const type = typeMap.get(item.key) ?? 'String';
                            newValues[item.key] = decodeParamValue({
                                key: item.key,
                                value: item.value,
                                type
                            });
                        }
                    }
                } else {
                    failCount += chunk.length;
                }
            } catch (e: any) {
                if (e.name === 'AbortError' || signal?.aborted) {
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
                    await new Promise(r => setTimeout(r, 10));
                }
                // Always clean up from the Set when done
                activePromises.delete(promise);
            }
        })();

        activePromises.add(promise);

        if (activePromises.size >= CONCURRENCY) {
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
        await new Promise(r => setTimeout(r, 1000));
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
