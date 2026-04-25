import { browser } from '$app/environment';

const HISTORY_KEY = 'sunnylink_search_history';
const HISTORY_MAX = 5;

function loadHistory(): string[] {
	if (!browser) return [];
	try {
		const raw = localStorage.getItem(HISTORY_KEY);
		if (!raw) return [];
		const parsed = JSON.parse(raw);
		return Array.isArray(parsed)
			? parsed.filter((s) => typeof s === 'string').slice(0, HISTORY_MAX)
			: [];
	} catch {
		return [];
	}
}

function persistHistory(history: string[]): void {
	if (!browser) return;
	try {
		localStorage.setItem(HISTORY_KEY, JSON.stringify(history));
	} catch {
		// Quota or private-mode — non-fatal.
	}
}

export const searchState = $state({
	query: '',
	isOpen: false,
	history: loadHistory(),

	setQuery(q: string) {
		this.query = q;
	},

	clear() {
		this.query = '';
	},

	open() {
		this.isOpen = true;
	},

	close() {
		this.isOpen = false;
	},

	toggle() {
		this.isOpen = !this.isOpen;
	},

	/** Record a completed query (e.g. on result-select). De-duplicates, MRU-ordered, capped. */
	pushHistory(q: string) {
		const t = q.trim();
		if (!t) return;
		const next = [t, ...this.history.filter((h) => h !== t)].slice(0, HISTORY_MAX);
		this.history = next;
		persistHistory(next);
	},

	clearHistory() {
		this.history = [];
		persistHistory([]);
	}
});
