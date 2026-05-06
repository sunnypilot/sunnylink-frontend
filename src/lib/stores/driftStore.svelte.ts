/**
 * Baseline store for drift detection.
 *
 * "Baseline" = snapshot of a device's param values at first fetch this session,
 * used by the layout prefetch to diff fresh device reads against what the web
 * UI last knew. Diffs (passive drifts) are now surfaced via the
 * SettingsRefreshBanner + the "Changed on device" item badge — both read
 * directly from `refreshBanner`, not from this store.
 *
 * Listener hook is retained for batchPush: a baseline mutation means the
 * device advanced to a new commit / refreshed values, so any queued edits
 * need to re-check their desiredValue against the new baseline.
 */

class DriftStore {
	private _baselines: Record<string, Record<string, unknown>> = {};
	private _baselineUpdateListener: ((deviceId: string) => void) | null = null;

	setBaselineUpdateListener(fn: (deviceId: string) => void): void {
		this._baselineUpdateListener = fn;
	}

	captureBaseline(deviceId: string, values: Record<string, unknown>): void {
		if (this._baselines[deviceId]) return;
		this._baselines[deviceId] = { ...values };
		this._baselineUpdateListener?.(deviceId);
	}

	getBaseline(deviceId: string): Record<string, unknown> {
		return this._baselines[deviceId] ?? {};
	}

	updateBaseline(deviceId: string, values: Record<string, unknown>): void {
		this._baselines[deviceId] = { ...values };
		this._baselineUpdateListener?.(deviceId);
	}

	/**
	 * No-op kept for call-site compatibility: batchPush and the layout prefetch
	 * call this after a successful push / fresh fetch to "acknowledge" a key.
	 * Previously cleared entries from an internal drift list; that list is no
	 * longer tracked here (refreshBanner owns the user-facing drift surface).
	 */
	resolveKeys(_deviceId: string, _keys: string[]): void {
		// intentionally empty
	}
}

export const driftStore = new DriftStore();
