/**
 * Schema-key helpers used by SettingsRefreshBanner.
 *
 * `resolveKeyPath` walks the schema to find a param key's panel + optional
 * sub-panel + display label, so refresh-banner entries can deep-link back
 * to their source row. `formatSchemaValue` renders a value the way the
 * settings UI would (option label, boolean as Off/On, scalar with unit).
 */

import type { SchemaItem, SchemaOption, SettingsSchema } from '$lib/types/schema';

export interface KeyPath {
	panelId: string;
	panelLabel: string;
	subPanelId?: string;
	label: string;
}

function matchItem(item: SchemaItem, key: string): SchemaItem | null {
	if (item.key === key) return item;
	for (const sub of item.sub_items ?? []) {
		if (sub.key === key) return sub;
	}
	return null;
}

export interface ResolvedKeyItem {
	path: KeyPath;
	item: SchemaItem;
}

export function findSchemaItem(
	schema: SettingsSchema | undefined,
	vehicleItems: SchemaItem[],
	key: string
): ResolvedKeyItem | null {
	for (const item of vehicleItems) {
		const hit = matchItem(item, key);
		if (hit)
			return {
				path: { panelId: 'vehicle', panelLabel: 'Vehicle', label: hit.title || hit.key },
				item: hit
			};
	}
	if (!schema) return null;

	for (const panel of schema.panels ?? []) {
		for (const item of panel.items ?? []) {
			const hit = matchItem(item, key);
			if (hit)
				return {
					path: { panelId: panel.id, panelLabel: panel.label, label: hit.title || hit.key },
					item: hit
				};
		}
		for (const sp of panel.sub_panels ?? []) {
			for (const item of sp.items) {
				const hit = matchItem(item, key);
				if (hit)
					return {
						path: {
							panelId: panel.id,
							panelLabel: panel.label,
							subPanelId: sp.id,
							label: hit.title || hit.key
						},
						item: hit
					};
			}
		}
		for (const section of panel.sections ?? []) {
			for (const item of section.items) {
				const hit = matchItem(item, key);
				if (hit)
					return {
						path: { panelId: panel.id, panelLabel: panel.label, label: hit.title || hit.key },
						item: hit
					};
			}
			for (const sp of section.sub_panels ?? []) {
				for (const item of sp.items) {
					const hit = matchItem(item, key);
					if (hit)
						return {
							path: {
								panelId: panel.id,
								panelLabel: panel.label,
								subPanelId: sp.id,
								label: hit.title || hit.key
							},
							item: hit
						};
				}
			}
		}
	}
	return null;
}

export function resolveKeyPath(
	schema: SettingsSchema | undefined,
	vehicleItems: SchemaItem[],
	key: string
): KeyPath | null {
	return findSchemaItem(schema, vehicleItems, key)?.path ?? null;
}

/** Normalize a param value for comparison against SchemaOption.value. */
function normalize(value: unknown): string {
	if (value === undefined || value === null) return '';
	if (typeof value === 'boolean') return value ? '1' : '0';
	return String(value);
}

function optionLabel(options: SchemaOption[] | undefined, value: unknown): string | null {
	if (!options) return null;
	const n = normalize(value);
	return options.find((o) => normalize(o.value) === n)?.label ?? null;
}

/** Resolve unit from SchemaItem, picking metric / imperial if the unit is a split map. */
function unitFor(item: SchemaItem | undefined): string {
	const u = item?.unit;
	if (!u) return '';
	if (typeof u === 'string') return u;
	return u.metric ?? u.imperial ?? '';
}

const MAX_DISPLAY_CHARS = 40;

function truncate(s: string): string {
	if (s.length <= MAX_DISPLAY_CHARS) return s;
	return `${s.slice(0, MAX_DISPLAY_CHARS - 1)}…`;
}

/**
 * Render a value as the settings UI would show it.
 *
 * - toggle → "Off" / "On"
 * - option / multiple_button → resolve option.label when available
 * - scalar with unit → "<num> <unit>" (unit on both sides per UX choice Q_v7)
 * - strings → truncated at 40 chars (mobile legibility)
 */
export function formatSchemaValue(item: SchemaItem | undefined, value: unknown): string {
	if (value === undefined || value === null || value === '') return '—';
	if (item?.widget === 'toggle') {
		return value === true || value === 1 || value === '1' ? 'On' : 'Off';
	}
	const label = optionLabel(item?.options, value);
	if (label) return label;
	const unit = unitFor(item);
	if (unit && (typeof value === 'number' || typeof value === 'string')) {
		return `${value} ${unit}`;
	}
	if (typeof value === 'boolean') return value ? 'On' : 'Off';
	return truncate(String(value));
}
