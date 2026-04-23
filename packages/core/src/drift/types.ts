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
