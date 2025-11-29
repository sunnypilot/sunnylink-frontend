import type { ExtendedDeviceParamKey } from '$lib/types/settings';

export const deviceState = $state({
    selectedDeviceId: (typeof localStorage !== 'undefined' ? localStorage.getItem('selectedDeviceId') || undefined : undefined) as string | undefined,
    deviceSettings: {} as Record<string, ExtendedDeviceParamKey[]>,
    deviceValues: {} as Record<string, Record<string, unknown>>,
    onlineStatuses: {} as Record<string, 'loading' | 'online' | 'offline'>,
    aliases: {} as Record<string, string>,
    aliasOverrides: {} as Record<string, string>,
    stagedChanges: {} as Record<string, Record<string, unknown>>,
    version: 0,

    // Helper to set selected device
    setSelectedDevice(deviceId: string) {
        this.selectedDeviceId = deviceId;
        if (typeof localStorage !== 'undefined') {
            localStorage.setItem('selectedDeviceId', deviceId);
        }
    },

    // Helper to stage a change
    stageChange(deviceId: string, key: string, value: unknown, originalValue: unknown) {
        if (!this.stagedChanges[deviceId]) {
            this.stagedChanges[deviceId] = {};
        }

        // If new value equals original, remove from staged
        if (value === originalValue) {
            delete this.stagedChanges[deviceId][key];
            if (Object.keys(this.stagedChanges[deviceId]).length === 0) {
                delete this.stagedChanges[deviceId];
            }
        } else {
            this.stagedChanges[deviceId][key] = value;
        }
    },

    // Helper to clear changes for a device
    clearChanges(deviceId: string) {
        if (this.stagedChanges[deviceId]) {
            delete this.stagedChanges[deviceId];
        }
    },

    // Helper to get a staged value
    getChange(deviceId: string, key: string) {
        return this.stagedChanges[deviceId]?.[key];
    },

    // Helper to check if there are changes
    hasChanges(deviceId: string) {
        return !!this.stagedChanges[deviceId] && Object.keys(this.stagedChanges[deviceId]).length > 0;
    },

    // Helper to prune changes that match current values
    pruneChanges(deviceId: string) {
        if (!this.stagedChanges[deviceId]) return;

        const currentValues = this.deviceValues[deviceId] || {};
        for (const key in this.stagedChanges[deviceId]) {
            const staged = this.stagedChanges[deviceId][key];
            const current = currentValues[key];

            // Simple equality check. For objects/arrays might need deep compare, 
            // but for settings (primitives usually) this is fine.
            // Also handle undefined/null equivalence if needed.
            if (staged === current) {
                delete this.stagedChanges[deviceId][key];
            }
        }

        if (Object.keys(this.stagedChanges[deviceId]).length === 0) {
            delete this.stagedChanges[deviceId];
        }
    },

    // Helper to update alias
    updateAlias(deviceId: string, alias: string) {
        this.aliases = { ...this.aliases, [deviceId]: alias };
        this.version++;
    },

    // Helper to set alias override
    setAliasOverride(deviceId: string, alias: string, originalAlias: string) {
        if (alias === originalAlias) {
            const newOverrides = { ...this.aliasOverrides };
            delete newOverrides[deviceId];
            this.aliasOverrides = newOverrides;
        } else {
            this.aliasOverrides = { ...this.aliasOverrides, [deviceId]: alias };
        }
    },

    // Helper to clear alias overrides
    clearAliasOverrides() {
        this.aliasOverrides = {};
    },

    // Helper to remove a specific alias override
    removeAliasOverride(deviceId: string) {
        delete this.aliasOverrides[deviceId];
    },

    // Helper to sort a list of devices
    sortDevices(list: any[]) {
        return [...list].sort((a, b) => {
            // Helper to get stable alias (ignoring unsaved overrides) for sorting
            const getStableAlias = (d: any) => this.aliases[d.device_id] ?? d.alias ?? d.device_id;

            // 1. Aliased (Aliased first)
            const aliasA = getStableAlias(a);
            const aliasB = getStableAlias(b);
            const hasAliasA = aliasA !== a.device_id;
            const hasAliasB = aliasB !== b.device_id;
            if (hasAliasA !== hasAliasB) return hasAliasA ? -1 : 1;

            // 2. Alphabetical (Alias or ID)
            return aliasA.localeCompare(aliasB);
        });
    }
});
