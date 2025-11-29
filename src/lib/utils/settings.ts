
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
            .filter((s) => s.value !== undefined)
            .filter((s) => !s.hidden)
            .filter((s) => showAdvanced || !s.advanced)
    );
}
