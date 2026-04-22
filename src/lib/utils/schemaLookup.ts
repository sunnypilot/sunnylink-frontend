/**
 * Given a schema + vehicle items + a param key, return the settings page path
 * (panelId + optional subPanelId) and human-readable label for that key.
 *
 * Used by SettingsRefreshBanner to deep-link "x settings refreshed" entries
 * back to the exact row in /dashboard/settings/<panelId>[?panel=<subPanelId>].
 */

import type { SchemaItem, SettingsSchema } from '$lib/types/schema';

export interface KeyPath {
	panelId: string;
	subPanelId?: string;
	label: string;
}

function matchItem(item: SchemaItem, key: string): string | null {
	if (item.key === key) return item.title || item.key;
	for (const sub of item.sub_items ?? []) {
		if (sub.key === key) return sub.title || sub.key;
	}
	return null;
}

export function resolveKeyPath(
	schema: SettingsSchema | undefined,
	vehicleItems: SchemaItem[],
	key: string
): KeyPath | null {
	for (const item of vehicleItems) {
		const label = matchItem(item, key);
		if (label) return { panelId: 'vehicle', label };
	}
	if (!schema) return null;

	for (const panel of schema.panels ?? []) {
		for (const item of panel.items ?? []) {
			const label = matchItem(item, key);
			if (label) return { panelId: panel.id, label };
		}
		for (const sp of panel.sub_panels ?? []) {
			for (const item of sp.items) {
				const label = matchItem(item, key);
				if (label) return { panelId: panel.id, subPanelId: sp.id, label };
			}
		}
		for (const section of panel.sections ?? []) {
			for (const item of section.items) {
				const label = matchItem(item, key);
				if (label) return { panelId: panel.id, label };
			}
			for (const sp of section.sub_panels ?? []) {
				for (const item of sp.items) {
					const label = matchItem(item, key);
					if (label) return { panelId: panel.id, subPanelId: sp.id, label };
				}
			}
		}
	}
	return null;
}
