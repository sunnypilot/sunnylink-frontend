import type { ExtendedDeviceParamKey } from '$lib/types/settings';
import { v1Client } from '$lib/api/client';
import { fetchAllSettings } from '$lib/utils/settings';

export const deviceState = $state({
    selectedDeviceId: (typeof localStorage !== 'undefined' ? localStorage.getItem('selectedDeviceId') || undefined : undefined) as string | undefined,
    deviceSettings: {} as Record<string, ExtendedDeviceParamKey[]>,
    deviceValues: {} as Record<string, Record<string, unknown>>,
    onlineStatuses: {} as Record<string, 'loading' | 'online' | 'offline'>,
    aliases: {} as Record<string, string>,
    aliasOverrides: {} as Record<string, string>,
    stagedChanges: {} as Record<string, Record<string, unknown>>,
    version: 0,

    // Migration State
    migrationWizardOpen: false,
    migrationTargetDeviceId: '',

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

    // Migration State
    migrationState: {
        isOpen: false,
        step: 1,
        type: null as 'new' | 'resume' | null,
        sourceDeviceId: '',
        targetDeviceId: '',
        backupFile: null as File | null,
        parsedBackup: null as any, // DeviceSettingsBackup
        comparison: [] as any[],
        isFetching: false,
        progress: 0,
        status: '',
        error: null as string | null,
        abortController: null as AbortController | null,
        isComparing: false
    },

    // Migration Actions
    openMigrationWizard(targetDeviceId: string = '') {
        this.migrationState.isOpen = true;
        // Only reset if not already active/fetching
        if (!this.migrationState.isFetching && this.migrationState.step === 1) {
            this.migrationState.targetDeviceId = targetDeviceId;
        } else if (targetDeviceId && !this.migrationState.targetDeviceId) {
            this.migrationState.targetDeviceId = targetDeviceId;
        }
    },

    closeMigrationWizard() {
        this.migrationState.isOpen = false;
        // If not fetching and not in middle of critical flow, maybe reset?
        // For now, we keep state to allow "resume" where you left off.
        // But if completely done, we should reset.
        if (!this.migrationState.isFetching && this.migrationState.step === 1) {
            this.resetMigrationState();
        }
    },

    minimizeMigration() {
        this.migrationState.isOpen = false;
    },

    resetMigrationState() {
        this.migrationState.step = 1;
        this.migrationState.type = null;
        this.migrationState.sourceDeviceId = '';
        this.migrationState.targetDeviceId = '';
        this.migrationState.backupFile = null;
        this.migrationState.parsedBackup = null;
        this.migrationState.comparison = [];
        this.migrationState.isFetching = false;
        this.migrationState.progress = 0;
        this.migrationState.status = '';
        this.migrationState.error = null;
        this.migrationState.abortController = null;
    },

    startMigrationFetch(sourceId: string) {
        this.migrationState.isFetching = true;
        this.migrationState.progress = 0;
        this.migrationState.status = 'Starting fetch...';
        this.migrationState.error = null;
        this.migrationState.sourceDeviceId = sourceId;
        this.migrationState.abortController = new AbortController();
    },

    async performMigrationFetch(token: string) {
        if (!this.migrationState.sourceDeviceId) return;

        // Ensure we are in fetching state
        if (!this.migrationState.isFetching) {
            this.startMigrationFetch(this.migrationState.sourceDeviceId);
        }

        try {
            const currentValues = this.deviceValues[this.migrationState.sourceDeviceId] || {};
            const allSettings = await fetchAllSettings(
                this.migrationState.sourceDeviceId,
                v1Client,
                token,
                currentValues,
                (progress, status) => {
                    this.setMigrationProgress(progress, status);
                },
                this.migrationState.abortController?.signal
            );

            this.finishMigrationFetch(true, allSettings);
        } catch (e: any) {
            if (e.message === 'Backup cancelled' || this.migrationState.abortController?.signal.aborted) {
                this.finishMigrationFetch(false, undefined, 'Migration cancelled');
            } else {
                console.error('Migration fetch failed', e);
                this.finishMigrationFetch(false, undefined, e.message || 'Failed to fetch settings');
            }
        }
    },

    setMigrationProgress(progress: number, status: string) {
        this.migrationState.progress = progress;
        this.migrationState.status = status;
    },

    setMigrationStatus(status: string) {
        this.migrationState.status = status;
    },

    finishMigrationFetch(success: boolean, data?: any, error?: string) {
        this.migrationState.isFetching = false;
        this.migrationState.abortController = null;
        if (success && data) {
            this.migrationState.parsedBackup = {
                version: 1,
                timestamp: Date.now(),
                deviceId: this.migrationState.sourceDeviceId,
                settings: data
            };
            this.migrationState.step = 3; // Move to Target/Download
            this.migrationState.status = 'Fetch complete';
            this.migrationState.progress = 100;
        } else {
            this.migrationState.error = error || 'Fetch failed';
            this.migrationState.status = 'Fetch failed';
        }
    },

    cancelMigration() {
        if (this.migrationState.abortController) {
            this.migrationState.abortController.abort();
            this.migrationState.abortController = null;
        }
        this.migrationState.isFetching = false;
        this.migrationState.status = 'Cancelled';
        this.migrationState.error = 'Migration cancelled';
    },

    setMigrationStep(step: number) {
        this.migrationState.step = step;
    },

    setMigrationType(type: 'new' | 'resume' | null) {
        this.migrationState.type = type;
    },

    setMigrationSource(deviceId: string) {
        this.migrationState.sourceDeviceId = deviceId;
    },

    setMigrationTarget(deviceId: string) {
        this.migrationState.targetDeviceId = deviceId;
    },

    setMigrationBackupFile(file: File) {
        this.migrationState.backupFile = file;
    },

    setMigrationParsedBackup(backup: any) {
        this.migrationState.parsedBackup = backup;
    },

    setMigrationComparison(comparison: any[]) {
        this.migrationState.comparison = comparison;
    },

    setMigrationComparing(isComparing: boolean) {
        this.migrationState.isComparing = isComparing;
    },

    // Global Backup State
    backupState: {
        isOpen: false,
        isDownloading: false,
        progress: 0,
        status: '',
        deviceId: '',
        abortController: null as AbortController | null
    },

    startBackup(deviceId: string) {
        if (this.backupState.isDownloading) return;
        this.backupState.isOpen = true;
        this.backupState.isDownloading = true;
        this.backupState.progress = 0;
        this.backupState.status = 'Starting backup...';
        this.backupState.deviceId = deviceId;
        this.backupState.abortController = new AbortController();
    },

    setBackupProgress(progress: number, status: string) {
        this.backupState.progress = progress;
        this.backupState.status = status;
    },

    cancelBackup() {
        if (this.backupState.abortController) {
            this.backupState.abortController.abort();
            this.backupState.abortController = null;
        }
        this.backupState.isDownloading = false;
        this.backupState.status = 'Backup cancelled';
    },

    finishBackup(success: boolean, message: string = '') {
        this.backupState.isDownloading = false;
        this.backupState.progress = success ? 100 : this.backupState.progress;
        this.backupState.status = message || (success ? 'Backup complete!' : 'Backup failed');
        this.backupState.abortController = null;
    },

    closeBackupModal() {
        this.backupState.isOpen = false;
        // If not downloading, reset state
        if (!this.backupState.isDownloading) {
            this.backupState.progress = 0;
            this.backupState.status = '';
            this.backupState.deviceId = '';
        }
    },

    openBackupModal() {
        this.backupState.isOpen = true;
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
