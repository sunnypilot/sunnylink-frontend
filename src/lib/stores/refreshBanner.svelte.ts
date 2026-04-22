/**
 * Session-scoped store for "setting refreshed from device" banner entries.
 *
 * Fired when the layout prefetch detects passive drift (device value differs
 * from cached value, with no pending user edit). Surfaces as a persistent
 * top banner so a driving-companion user can review changes when parked,
 * instead of ephemeral toasts they'd miss.
 *
 * Persists to sessionStorage: survives page reload within the same tab,
 * clears on tab close. By the next session the device/cache reconcile
 * naturally so resurfacing past refreshes would be confusing.
 */

import { browser } from '$app/environment';

export interface RefreshEntry {
	key: string;
	label: string;
	panelId: string;
	panelLabel: string;
	subPanelId?: string;
	oldDisplay: string;
	newDisplay: string;
	hadOld: boolean;
	at: number;
}

interface Persisted {
	entries: Record<string, RefreshEntry[]>;
	expanded: Record<string, boolean>;
}

const STORAGE_KEY = 'sl.refreshBanner.v1';

class RefreshBannerStore {
	entries: Record<string, RefreshEntry[]> = $state({});
	expanded: Record<string, boolean> = $state({});

	constructor() {
		if (browser) this._hydrate();
	}

	private _hydrate(): void {
		try {
			const raw = sessionStorage.getItem(STORAGE_KEY);
			if (!raw) return;
			const parsed = JSON.parse(raw) as Partial<Persisted>;
			this.entries = parsed.entries ?? {};
			this.expanded = parsed.expanded ?? {};
		} catch {
			// corrupt payload — drop it silently
		}
	}

	private _persist(): void {
		if (!browser) return;
		try {
			const payload: Persisted = {
				entries: this.entries,
				expanded: this.expanded
			};
			sessionStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
		} catch {
			// quota or private-mode lockout — non-fatal
		}
	}

	/** Merge new passive-refresh entries for a device. Latest value per key wins. */
	add(deviceId: string, incoming: RefreshEntry[]): void {
		if (incoming.length === 0) return;
		const existing = this.entries[deviceId] ?? [];
		const byKey = new Map<string, RefreshEntry>();
		for (const e of existing) byKey.set(e.key, e);
		for (const e of incoming) byKey.set(e.key, e);
		this.entries = { ...this.entries, [deviceId]: [...byKey.values()] };
		this._persist();
	}

	/** Remove a single entry (used when the user clicks its jump link — view == ack). */
	dismissOne(deviceId: string, key: string): void {
		const list = this.entries[deviceId];
		if (!list) return;
		const next = list.filter((e) => e.key !== key);
		this.entries = { ...this.entries, [deviceId]: next };
		this._persist();
	}

	/** Bulk dismiss via the X button. */
	dismissAll(deviceId: string): void {
		if (!this.entries[deviceId]) return;
		const next = { ...this.entries };
		delete next[deviceId];
		this.entries = next;
		this._persist();
	}

	/** Clear everything for a device (on device pill change). */
	clearDevice(deviceId: string): void {
		const nextEntries = { ...this.entries };
		delete nextEntries[deviceId];
		this.entries = nextEntries;
		const nextExpanded = { ...this.expanded };
		delete nextExpanded[deviceId];
		this.expanded = nextExpanded;
		this._persist();
	}

	getAll(deviceId: string): RefreshEntry[] {
		return this.entries[deviceId] ?? [];
	}

	count(deviceId: string): number {
		return this.entries[deviceId]?.length ?? 0;
	}

	isExpanded(deviceId: string): boolean {
		return this.expanded[deviceId] ?? false;
	}

	setExpanded(deviceId: string, value: boolean): void {
		this.expanded = { ...this.expanded, [deviceId]: value };
		this._persist();
	}
}

export const refreshBanner = new RefreshBannerStore();
