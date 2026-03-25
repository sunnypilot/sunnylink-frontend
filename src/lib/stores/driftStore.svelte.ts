/**
 * Reactive store for detected drift entries per device.
 *
 * Drift = a setting changed on the device since the web UI last fetched it.
 * Populated when fresh values arrive (in category page fetch) by comparing
 * against the cached values. Persists across panel navigation so drifts
 * from all panels are visible in the global banner.
 */

import type { DriftEntry } from '$lib/utils/drift';

class DriftStore {
	/** deviceId → DriftEntry[] */
	private _drifts: Record<string, DriftEntry[]> = $state({});

	/** Drift baseline: snapshot of values at first load, for comparison against fresh fetch.
	 *  Persists across layout mount/unmount cycles (e.g. navigating to Models and back). */
	private _baselines: Record<string, Record<string, unknown>> = {};

	/** Capture a baseline snapshot for a device (only captures once per session). */
	captureBaseline(deviceId: string, values: Record<string, unknown>): void {
		if (this._baselines[deviceId]) return;
		this._baselines[deviceId] = { ...values };
	}

	/** Get the baseline for drift comparison. Returns empty if not captured. */
	getBaseline(deviceId: string): Record<string, unknown> {
		return this._baselines[deviceId] ?? {};
	}

	/** Update baseline to current values (e.g. after version change or manual refresh). */
	updateBaseline(deviceId: string, values: Record<string, unknown>): void {
		this._baselines[deviceId] = { ...values };
	}

	/**
	 * Merge detected drifts for a device.
	 * Updates existing entries for the same keys, adds new ones,
	 * and preserves drifts from other panels.
	 */
	mergeDrifts(deviceId: string, drifts: DriftEntry[]): void {
		const existing = this._drifts[deviceId] ?? [];
		const incomingKeys = new Set(drifts.map((d) => d.key));
		// Keep drifts from other keys (other panels), replace matching keys with fresh data
		const kept = existing.filter((d) => !incomingKeys.has(d.key));
		this._drifts[deviceId] = [...kept, ...drifts];
	}

	/**
	 * Remove drifts for keys that are no longer drifted (resolved on a panel fetch).
	 * Called with the keys that were fetched + had no drift, to clear stale entries.
	 */
	resolveKeys(deviceId: string, resolvedKeys: string[]): void {
		const existing = this._drifts[deviceId];
		if (!existing || existing.length === 0) return;
		const resolved = new Set(resolvedKeys);
		this._drifts[deviceId] = existing.filter((d) => !resolved.has(d.key));
	}

	/** Get all drifts for a device */
	getAll(deviceId: string): DriftEntry[] {
		return this._drifts[deviceId] ?? [];
	}

	/** Get drift for a specific key */
	getForKey(deviceId: string, key: string): DriftEntry | undefined {
		return this._drifts[deviceId]?.find((d) => d.key === key);
	}

	/** Check if a specific key has drifted */
	hasDrift(deviceId: string, key: string): boolean {
		return this._drifts[deviceId]?.some((d) => d.key === key) ?? false;
	}

	/** Count of drifted keys for a device */
	count(deviceId: string): number {
		return this._drifts[deviceId]?.length ?? 0;
	}

	/** Dismiss a specific drift entry */
	dismiss(deviceId: string, key: string): void {
		const drifts = this._drifts[deviceId];
		if (!drifts) return;
		this._drifts[deviceId] = drifts.filter((d) => d.key !== key);
	}

	/** Dismiss all drifts for a device */
	dismissAll(deviceId: string): void {
		this._drifts[deviceId] = [];
	}

	/** Clear all drifts (e.g. on navigation) */
	clear(): void {
		this._drifts = {};
	}
}

export const driftStore = new DriftStore();
