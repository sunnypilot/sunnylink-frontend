import type { ExtendedDeviceParamKey } from '$lib/types/settings';

export const deviceState = $state({
    selectedDeviceId: undefined as string | undefined,
    deviceSettings: {} as Record<string, ExtendedDeviceParamKey[]>,
    deviceValues: {} as Record<string, Record<string, unknown>>,
    onlineStatuses: {} as Record<string, 'loading' | 'online' | 'offline'>,
    aliases: {} as Record<string, string>,
    aliasOverrides: {} as Record<string, string>,
    stagedChanges: {} as Record<string, Record<string, unknown>>,
    version: 0,

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
    }
});
