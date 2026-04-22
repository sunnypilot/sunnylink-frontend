export interface DriftEntry {
	key: string;
	cachedValue: unknown;
	freshValue: unknown;
	detectedAt: number;
	panelId?: string;
	panelLabel?: string;
	sectionLabel?: string;
	subPanelLabel?: string;
	itemTitle?: string;
}

export interface PendingLike {
	key: string;
	desiredValue: unknown;
}

function normalize(value: unknown): string {
	if (value === undefined || value === null) return '';
	if (typeof value === 'boolean') return value ? '1' : '0';
	return String(value);
}

export function detectDrift(
	cached: Record<string, unknown>,
	fresh: Record<string, unknown>
): DriftEntry[] {
	const drifts: DriftEntry[] = [];

	for (const key of Object.keys(fresh)) {
		if (!(key in cached)) continue;
		if (normalize(cached[key]) !== normalize(fresh[key])) {
			drifts.push({
				key,
				cachedValue: cached[key],
				freshValue: fresh[key],
				detectedAt: Date.now()
			});
		}
	}

	return drifts;
}

export function filterMeaningfulDrift<TPending extends PendingLike>(
	drifts: DriftEntry[],
	pending: TPending[]
): DriftEntry[] {
	const pendingMap = new Map(pending.map((item) => [item.key, item]));

	return drifts.filter((entry) => {
		const pendingEntry = pendingMap.get(entry.key);
		if (!pendingEntry) return true;
		if (normalize(entry.freshValue) === normalize(pendingEntry.desiredValue)) return false;
		return true;
	});
}

export function detectConflicts<TPending extends PendingLike>(
	drifts: DriftEntry[],
	pending: TPending[]
): DriftEntry[] {
	const pendingMap = new Map(pending.map((item) => [item.key, item]));

	return drifts.filter((entry) => {
		const pendingEntry = pendingMap.get(entry.key);
		if (!pendingEntry) return false;
		return normalize(entry.freshValue) !== normalize(pendingEntry.desiredValue);
	});
}
