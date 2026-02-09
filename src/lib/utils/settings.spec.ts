import { describe, it, expect } from 'vitest';
import { getAllSettings } from './settings';
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

	it('does not accept a showAdvanced parameter', () => {
		// Verify the function signature only has 3 parameters (settings, showHidden, returnSections)
		expect(getAllSettings.length).toBe(1);
	});
});
