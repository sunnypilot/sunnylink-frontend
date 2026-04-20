import Fuse, { type IFuseOptions, type FuseResultMatch } from 'fuse.js';
import type { RenderableSetting } from '$lib/types/settings';

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

// `threshold` and `MIN_MATCH_SCORE` tuned together after browser testing:
// 0.4 was too lenient (almost every setting matched common tokens like
// "enable"). 0.3 drops fuzzy recall; the post-filter then strips residual
// low-confidence hits so results look relevant, not exhaustive.
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
	includeScore: true,
	includeMatches: true
};

const MIN_MATCH_SCORE = 50;

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
