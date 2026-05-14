import Fuse, { type IFuseOptions, type FuseResultMatch } from 'fuse.js';
import type { RenderableSetting } from '$lib/types/settings';
import type { SettingsSchema } from '$lib/types/schema';

export interface SearchResult {
	setting: RenderableSetting;
	score: number;
	matches?: readonly FuseResultMatch[];
}

interface SearchRecord {
	setting: RenderableSetting;
	title: string;
	key: string;
	description: string;
	category: string;
}

// Tuned after browser testing. Single-word queries like "enable" used to
// match half the catalog at threshold 0.4; tightening to 0.3 alone then
// broke multi-word queries because the default fuzzy matcher treats the
// whole query as one contiguous pattern, so "enable runner" couldn't span
// "GitHub Runner" + "EnableGithubRunner" in different fields.
//
// `useExtendedSearch` flips space-separated tokens into an AND of per-token
// fuzzy patterns — each token must match in at least one key per record.
// That naturally filters noise for multi-word queries, so the hard score
// floor can relax to 40 without false positives creeping back in.
const FUSE_OPTIONS: IFuseOptions<SearchRecord> = {
	keys: [
		{ name: 'title', weight: 0.5 },
		{ name: 'key', weight: 0.3 },
		{ name: 'description', weight: 0.15 },
		{ name: 'category', weight: 0.05 }
	],
	threshold: 0.3,
	ignoreLocation: true,
	minMatchCharLength: 3,
	useExtendedSearch: true,
	includeScore: true,
	includeMatches: true
};

const MIN_MATCH_SCORE = 40;

// Cache Fuse instances keyed by the source array identity. `$derived` returns a
// stable reference across re-renders while dependencies are unchanged, so the
// keystroke-driven search avoids re-indexing on every call.
const fuseCache = new WeakMap<readonly RenderableSetting[], Fuse<SearchRecord>>();

function getFuse(settings: readonly RenderableSetting[]): Fuse<SearchRecord> {
	let fuse = fuseCache.get(settings);
	if (!fuse) {
		const records: SearchRecord[] = settings.map((s) => ({
			setting: s,
			title: s._extra?.title || s.label,
			key: s.key,
			description: s._extra?.description || s.description,
			category: s.category
		}));
		fuse = new Fuse(records, FUSE_OPTIONS);
		fuseCache.set(settings, fuse);
	}
	return fuse;
}

// ─── Schema-first search ──────────────────────────────────────────────────────

export interface SchemaItemRecord {
	key: string;
	/** The key used in the URL fragment (#key). For sub_items this is the parent's key,
	 *  since sub_items don't get their own DOM id. */
	anchorKey: string;
	title: string;
	description: string;
	panelId: string;
	panelLabel: string;
	subPanelId?: string;
	/** Set only for vehicle_settings items. Used to filter to current device brand. */
	brand?: string;
}

export interface SchemaSearchResult {
	item: SchemaItemRecord;
	score: number;
	matches?: readonly FuseResultMatch[];
}

const SCHEMA_FUSE_OPTIONS: IFuseOptions<SchemaItemRecord> = {
	keys: [
		{ name: 'title', weight: 0.5 },
		{ name: 'key', weight: 0.3 },
		{ name: 'description', weight: 0.15 },
		{ name: 'panelLabel', weight: 0.05 }
	],
	threshold: 0.3,
	ignoreLocation: true,
	minMatchCharLength: 3,
	useExtendedSearch: true,
	includeScore: true,
	includeMatches: true
};

const schemaFuseCache = new WeakMap<SettingsSchema, Fuse<SchemaItemRecord>>();

export function buildSchemaRecords(schema: SettingsSchema): SchemaItemRecord[] {
	const records: SchemaItemRecord[] = [];

	for (const panel of schema.panels) {
		const { id: panelId, label: panelLabel } = panel;

		function addItem(
			item: {
				key: string;
				title?: string;
				description?: string;
				sub_items?: { key: string; title?: string; description?: string }[];
			},
			subPanelId?: string
		) {
			records.push({
				key: item.key,
				anchorKey: item.key,
				title: item.title ?? item.key,
				description: item.description ?? '',
				panelId,
				panelLabel,
				subPanelId
			});
			for (const sub of item.sub_items ?? []) {
				records.push({
					key: sub.key,
					anchorKey: item.key, // sub_items don't get their own DOM id; anchor to parent
					title: sub.title ?? sub.key,
					description: sub.description ?? '',
					panelId,
					panelLabel,
					subPanelId
				});
			}
		}

		for (const item of panel.items ?? []) addItem(item);
		for (const sp of panel.sub_panels ?? []) {
			for (const item of sp.items) addItem(item, sp.id);
		}
		for (const section of panel.sections ?? []) {
			for (const item of section.items) addItem(item);
			for (const sp of section.sub_panels ?? []) {
				for (const item of sp.items) addItem(item, sp.id);
			}
		}
	}

	// Vehicle-specific settings: all brands are indexed here, filtered post-search by currentBrand.
	for (const [brand, brandData] of Object.entries(schema.vehicle_settings ?? {})) {
		const panelLabel = brandData.title ?? brand;
		for (const item of brandData.items ?? []) {
			records.push({
				key: item.key,
				anchorKey: item.key,
				title: item.title ?? item.key,
				description: item.description ?? '',
				panelId: 'vehicle',
				panelLabel,
				brand
			});
			for (const sub of item.sub_items ?? []) {
				records.push({
					key: sub.key,
					anchorKey: item.key,
					title: sub.title ?? sub.key,
					description: sub.description ?? '',
					panelId: 'vehicle',
					panelLabel,
					brand
				});
			}
		}
	}

	return records;
}

function getSchemaFuse(schema: SettingsSchema): Fuse<SchemaItemRecord> {
	let fuse = schemaFuseCache.get(schema);
	if (!fuse) {
		fuse = new Fuse(buildSchemaRecords(schema), SCHEMA_FUSE_OPTIONS);
		schemaFuseCache.set(schema, fuse);
	}
	return fuse;
}

export function searchSchemaItems(
	query: string,
	schema: SettingsSchema,
	values?: Record<string, unknown>,
	currentBrand?: string
): SchemaSearchResult[] {
	const q = query.trim();
	if (!q) return [];

	const hits = getSchemaFuse(schema).search(q);
	const normalized = q.toLowerCase();

	return (
		hits
			.map((hit): SchemaSearchResult => {
				const baseScore = (1 - (hit.score ?? 1)) * 100;
				const raw = values?.[hit.item.key];
				const valueStr = raw !== undefined && raw !== null ? String(raw).toLowerCase() : '';
				const valueBonus = valueStr && valueStr.includes(normalized) ? 5 : 0;
				return { item: hit.item, score: baseScore + valueBonus, matches: hit.matches };
			})
			.filter((r) => r.score >= MIN_MATCH_SCORE)
			// Vehicle settings: only surface results for the connected device's brand.
			.filter((r) => !r.item.brand || !currentBrand || r.item.brand === currentBrand)
			.sort((a, b) => b.score - a.score)
			.slice(0, 20)
	);
}

// ─── Legacy search (SETTINGS_DEFINITIONS path for non-schema devices) ─────────

export function searchSettings(
	query: string,
	settings: readonly RenderableSetting[],
	values?: Record<string, unknown>
): SearchResult[] {
	const q = query.trim();
	if (!q) return [];

	const hits = getFuse(settings).search(q);
	const normalized = q.toLowerCase();

	return hits
		.map((hit): SearchResult => {
			// Fuse score: 0 = perfect, 1 = miss. Invert to 0..100 so a value-match
			// bonus can stack without re-ranking against a reversed axis.
			const baseScore = (1 - (hit.score ?? 1)) * 100;

			// Value bonus preserves pre-fuzzy behavior — typing "aggressive" still
			// surfaces DrivingPersonality when its current/default value stringifies
			// to that label.
			const setting = hit.item.setting;
			const raw = values?.[setting.key] ?? setting.value?.default_value;
			const valueStr = raw !== undefined && raw !== null ? String(raw).toLowerCase() : '';
			const valueBonus = valueStr && valueStr.includes(normalized) ? 5 : 0;

			return {
				setting,
				score: baseScore + valueBonus,
				matches: hit.matches
			};
		})
		.filter((r) => r.score >= MIN_MATCH_SCORE)
		.sort((a, b) => b.score - a.score);
}
