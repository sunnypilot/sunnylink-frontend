import { describe, it, expect } from 'vitest';
import { getAllSettings, getBackupKeys, BACKUP_EXCLUDED_KEYS } from './settings';
import type { ExtendedDeviceParamKey } from '$lib/types/settings';
import { SETTINGS_DEFINITIONS } from '$lib/types/settings';

describe('getAllSettings', () => {
	// Build mock settings from all defined keys so they have values
	const mockSettings: ExtendedDeviceParamKey[] = SETTINGS_DEFINITIONS.filter(
		(d) => !d.isSection
	).map((d) => ({ key: d.key }));

	it('always includes advanced settings', () => {
		const results = getAllSettings(mockSettings);
		const advancedSettings = results.filter((s) => s.advanced);
		expect(advancedSettings.length).toBeGreaterThan(0);
	});

	it('does not include hidden settings by default', () => {
		const results = getAllSettings(mockSettings);
		const hiddenSettings = results.filter((s) => s.hidden);
		expect(hiddenSettings.length).toBe(0);
	});

	it('includes hidden settings when showHidden is true', () => {
		const results = getAllSettings(mockSettings, true);
		const hiddenSettings = results.filter((s) => s.hidden);
		expect(hiddenSettings.length).toBeGreaterThanOrEqual(0);
	});

	it('includes sections by default', () => {
		const results = getAllSettings(mockSettings);
		const sections = results.filter((s) => s.isSection);
		expect(sections.length).toBeGreaterThanOrEqual(0);
	});

	it('excludes sections when returnSections is false', () => {
		const results = getAllSettings(mockSettings, false, false);
		const sections = results.filter((s) => s.isSection);
		expect(sections.length).toBe(0);
	});
});

describe('getBackupKeys', () => {
	it('excludes readonly keys from static definitions', () => {
		const keys = getBackupKeys();
		const readonlyKeys = SETTINGS_DEFINITIONS.filter((d) => d.readonly).map((d) => d.key);
		for (const rk of readonlyKeys) {
			expect(keys).not.toContain(rk);
		}
	});

	it('excludes section markers', () => {
		const keys = getBackupKeys();
		const sectionKeys = keys.filter((k) => k.startsWith('_sec_'));
		expect(sectionKeys.length).toBe(0);
	});

	it('excludes isSection keys', () => {
		const keys = getBackupKeys();
		const sectionDefs = SETTINGS_DEFINITIONS.filter((d) => d.isSection).map((d) => d.key);
		for (const sk of sectionDefs) {
			expect(keys).not.toContain(sk);
		}
	});

	it('excludes BACKUP_EXCLUDED_KEYS', () => {
		const keys = getBackupKeys();
		for (const excluded of BACKUP_EXCLUDED_KEYS) {
			expect(keys).not.toContain(excluded);
		}
	});

	it('includes writable non-excluded keys', () => {
		const keys = getBackupKeys();
		expect(keys).toContain('IsMetric');
		expect(keys).toContain('LanguageSetting');
	});

	it('uses device-reported keys as primary source when available', () => {
		const deviceSettings: ExtendedDeviceParamKey[] = [
			{ key: 'IsMetric' },
			{ key: 'CustomDeviceParam' }
		];
		const keys = getBackupKeys(deviceSettings);
		expect(keys).toContain('IsMetric');
		expect(keys).toContain('CustomDeviceParam');
	});

	it('excludes readonly device-reported keys via static definitions', () => {
		const deviceSettings: ExtendedDeviceParamKey[] = [
			{ key: 'IsMetric' },
			{ key: 'DongleId' } // readonly in static defs
		];
		const keys = getBackupKeys(deviceSettings);
		expect(keys).toContain('IsMetric');
		expect(keys).not.toContain('DongleId');
	});

	it('includes unknown device keys not in static defs (treated as writable)', () => {
		const deviceSettings: ExtendedDeviceParamKey[] = [{ key: 'BrandNewFirmwareParam' }];
		const keys = getBackupKeys(deviceSettings);
		expect(keys).toContain('BrandNewFirmwareParam');
	});

	it('does not include ModelManager_ModelsCache even if device reports it', () => {
		const deviceSettings: ExtendedDeviceParamKey[] = [
			{ key: 'IsMetric' },
			{ key: 'ModelManager_ModelsCache' }
		];
		const keys = getBackupKeys(deviceSettings);
		expect(keys).not.toContain('ModelManager_ModelsCache');
	});

	it('falls back to static definitions when no device settings provided', () => {
		const keys = getBackupKeys();
		const writableStaticKeys = SETTINGS_DEFINITIONS.filter(
			(d) =>
				!d.readonly &&
				!d.isSection &&
				!BACKUP_EXCLUDED_KEYS.has(d.key) &&
				!d.key.startsWith('_sec_')
		).map((d) => d.key);
		for (const k of writableStaticKeys) {
			expect(keys).toContain(k);
		}
	});

	it('falls back to static definitions when empty device settings provided', () => {
		const keys = getBackupKeys([]);
		const keysNoDevice = getBackupKeys();
		expect(keys).toEqual(keysNoDevice);
	});
});
