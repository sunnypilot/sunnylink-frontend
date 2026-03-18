/**
 * Reactive store for detected drift entries per device.
 *
 * Drift = a setting changed on the device since the web UI last fetched it.
 * Populated when fresh values arrive (in category page fetch) by comparing
 * against the cached values. Cleared on page navigation or manual dismiss.
 */

import type { DriftEntry } from '$lib/utils/drift';

class DriftStore {
	/** deviceId → DriftEntry[] */
	private _drifts: Record<string, DriftEntry[]> = $state({});

	/** Set detected drifts for a device (replaces previous) */
	setDrifts(deviceId: string, drifts: DriftEntry[]): void {
		this._drifts[deviceId] = [...drifts];
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
