/** Batches per-device param changes, flushing as a single setDeviceParams() call after a 4s debounce. */

import { setDeviceParams, fetchSettingsAsync, DeviceRejectionError } from '$lib/api/device';
import { encodeParamValue, decodeParamValue } from '$lib/utils/device';
import { deviceState } from '$lib/stores/device.svelte';
import { logtoClient } from '$lib/logto/auth.svelte';
import { updateCachedValue } from '$lib/stores/valuesCache';
import { pushStateStore } from '$lib/stores/pushState.svelte';
import { driftStore } from '$lib/stores/driftStore.svelte';
import { schemaState } from '$lib/stores/schema.svelte';
import { toast } from 'svelte-sonner';

const DEBOUNCE_MS = 4_000;
const CONFIRMED_CLEAR_MS = 3_000;
const VERIFY_SETTLE_MS = 500; // give the device a beat before the readback
const VERIFY_POLL_INTERVAL_MS = 0; // unused: single-shot verify now
const VERIFY_MAX_ATTEMPTS = 1; // one quick readback; fall through to optimistic confirm on miss (was 9s — caused 20s spinner regression)

export type KeyState = 'pending' | 'syncing' | 'confirmed' | 'failed';

export interface BatchEntry {
	desiredValue: unknown;
	previousValue: unknown;
	encodedValue: string;
	paramType: string;
	timestamp: number;
}

export interface ConflictEntry {
	yourValue: unknown;
	deviceValue: unknown;
	paramType: string;
}

type DeviceQueue = Record<string, BatchEntry>;
type DeviceConflicts = Record<string, ConflictEntry>;

/**
 * Queues/states are intentionally NOT $state — deep $state proxies were racing
 * with rapid-click reverts (cancel() would reassign the nested proxy, but a
 * subsequent enqueue within the same microtask could still read the pre-reset
 * snapshot and leave the Pending pill stuck). Plain records make mutations
 * visible to JS immediately; reactivity is driven by a single $state version
 * counter that every reader reads and every mutator bumps.
 */
class BatchPushStore {
	private queues: Record<string, DeviceQueue> = {};
	private states: Record<string, Record<string, KeyState>> = {};
	private timers: Record<string, ReturnType<typeof setTimeout>> = {};
	private flushing: Record<string, boolean> = {};
	/** Per-device pause flag: true when a baseline arrival (reconnect / refresh)
	 *  revealed at least one queued desiredValue that conflicts with the
	 *  device's authoritative value. While paused, the debounce timer is
	 *  cleared and flush() early-returns — the user must resolve each
	 *  conflict via SyncStatusBanner (Apply yours / Keep device). */
	private paused: Record<string, boolean> = {};
	/** Per-device conflict map surfaced in SyncStatusBanner. Rebuilt by
	 *  `checkConflictsAgainstBaseline` every time driftStore notifies a
	 *  baseline change. */
	private conflicts: Record<string, DeviceConflicts> = {};
	private version = $state(0);

	private bump(): void {
		this.version++;
	}

	constructor() {
		if (typeof window !== 'undefined') {
			window.addEventListener('beforeunload', () => this.flushAll());
			document.addEventListener('visibilitychange', () => {
				if (document.visibilityState === 'hidden') this.flushAll();
			});
		}
		// Drift baseline is the device-authoritative source of truth. Whenever
		// it changes (reconnect, manual refresh, periodic drift poll, or our
		// own post-confirm updates), re-check the queue for conflicts. Self-
		// confirming updates are harmless: baseline[key] will equal queued
		// desiredValue so no conflict is raised.
		driftStore.setBaselineUpdateListener((deviceId) => this.checkConflictsAgainstBaseline(deviceId));
	}

	/** Add or update a change in the device batch. Resets the debounce timer.
	 *  Net-change detection: if the user reverts to the original value, the key
	 *  is removed from the batch entirely (no wasted device round-trip). */
	enqueue(
		deviceId: string,
		key: string,
		newValue: unknown,
		previousValue: unknown,
		paramType: string
	): void {
		if (!this.queues[deviceId]) this.queues[deviceId] = {};
		if (!this.states[deviceId]) this.states[deviceId] = {};

		// originalValue priority:
		//   1. driftStore baseline (device-authoritative, survives mid-session
		//      refreshes, reconciles with post-confirm baseline updates)
		//   2. existing.previousValue (in-queue snapshot from first enqueue)
		//   3. caller-passed previousValue (deviceValues may be stale/undefined
		//      before first fetch — last resort)
		//
		// Always prefer baseline when it has an entry for this key, even over
		// an existing queue entry. Baseline gets refreshed after every
		// confirmed push — `existing.previousValue` would otherwise go stale
		// once baseline mutates, breaking subsequent revert detection.
		const existing = this.queues[deviceId][key];
		const baseline = driftStore.getBaseline(deviceId);
		const baselineHasKey = Object.prototype.hasOwnProperty.call(baseline, key);
		let originalValue: unknown;
		if (baselineHasKey) {
			originalValue = baseline[key];
		} else if (existing) {
			originalValue = existing.previousValue;
		} else {
			originalValue = previousValue;
		}

		// Net-change detection: user reverted to original → drop the key.
		// `cancel()` tears the timer down when the queue empties. When
		// other keys remain queued we reset the shared debounce: the
		// device has ONE countdown per batch, and any user action on any
		// key (including a revert) counts as activity that extends the
		// window for every still-queued key. This is the agreed batching
		// strategy — one debounced flush per device, not per key.
		if (this.valuesEqual(newValue, originalValue)) {
			this.cancel(deviceId, key);
			const stillQueued = Object.keys(this.queues[deviceId] ?? {}).length > 0;
			if (stillQueued) this.resetTimer(deviceId);
			return;
		}

		const encoded = encodeParamValue({ key, value: newValue, type: paramType });
		if (encoded === null) {
			toast.error(`Failed to encode value for ${key}`);
			return;
		}

		this.queues[deviceId][key] = {
			desiredValue: newValue,
			previousValue: originalValue,
			encodedValue: encoded,
			paramType,
			timestamp: Date.now()
		};
		this.states[deviceId][key] = 'pending';
		this.bump();
		this.resetTimer(deviceId);
	}

	/** Equality for param values — normalizes across primitive encodings.
	 *  Device readbacks and caller-provided values can land in slightly
	 *  different shapes (boolean `true` vs string `"1"` vs number `1`, etc.)
	 *  when type metadata is missing from one source. A loose, primitive-aware
	 *  comparator keeps revert/conflict detection robust without demanding
	 *  every call site agree on a canonical form. */
	private valuesEqual(a: unknown, b: unknown): boolean {
		if (a === b) return true;
		if (a == null || b == null) return a == null && b == null;
		if (typeof a === 'object' || typeof b === 'object') {
			try {
				return JSON.stringify(a) === JSON.stringify(b);
			} catch {
				return false;
			}
		}
		// Primitive cross-type normalize: bool ↔ "1"/"0" ↔ "true"/"false" ↔ 1/0
		return this.normalizePrimitive(a) === this.normalizePrimitive(b);
	}

	/** Canonical string form for primitives so "1" == true == 1 etc. */
	private normalizePrimitive(v: unknown): string {
		if (typeof v === 'boolean') return v ? '1' : '0';
		if (typeof v === 'number') {
			if (v === 1) return '1';
			if (v === 0) return '0';
			return String(v);
		}
		if (typeof v === 'string') {
			const lower = v.toLowerCase();
			if (lower === 'true') return '1';
			if (lower === 'false') return '0';
			return v;
		}
		return String(v);
	}

	/** Immediately flush all pending changes for a device.
	 *  Dispatches the v0 POST (fire-and-forget for the slow response), then verifies
	 *  the write by reading back the values via the fast v1 async API.
	 *  Confirmation happens when the read-back matches — identical timing for all params. */
	async flush(deviceId: string): Promise<void> {
		this.clearTimer(deviceId);
		if (this.paused[deviceId]) return;
		const queue = this.queues[deviceId];
		if (!queue || Object.keys(queue).length === 0) return;
		if (this.flushing[deviceId]) return;

		// Pre-flush no-op scrub: drop any queued key whose desiredValue
		// equals the device-confirmed baseline. Belt-and-braces against
		// enqueue-time revert detection failing (e.g. a stale previousValue
		// seeded a bad originalValue on the first click, and valuesEqual
		// never matched on subsequent flips). No point POSTing a value the
		// device already holds.
		const baseline = driftStore.getBaseline(deviceId);
		if (Object.keys(baseline).length > 0) {
			for (const k of Object.keys(queue)) {
				if (
					Object.prototype.hasOwnProperty.call(baseline, k) &&
					this.valuesEqual(queue[k]!.desiredValue, baseline[k])
				) {
					this.cancel(deviceId, k);
				}
			}
			if (Object.keys(queue).length === 0) return;
		}

		this.flushing[deviceId] = true;
		const keys = Object.keys(queue);
		const entries = { ...queue };
		// Snapshot baseline at push time — verifyWrite compares readback against
		// this, not against the mutable live baseline. Prevents a mid-flight
		// baseline update (from an unrelated confirm) from skewing conflict
		// detection for this specific push.
		const baselineAtPushTime = { ...baseline };

		// Mark all as syncing (muted UI, blue accent)
		for (const k of keys) {
			this.setKeyState(deviceId, k, 'syncing');
			pushStateStore.startPush(deviceId, k);
		}

		try {
			const token = await logtoClient?.getIdToken();
			if (!token) {
				this.handleDefiniteFailure(
					deviceId,
					keys,
					entries,
					'Session expired. Please sign in again.'
				);
				return;
			}

			const params = keys.map((k) => ({ key: k, value: entries[k]!.encodedValue }));

			// Fire the v0 POST — don't await the slow backend response.
			// Optimistic confirm happens immediately below; errors roll the UI back
			// asynchronously. A definite rejection (4xx, network) downgrades the
			// confirmed checkmark to a failed state once the catch fires.
			setDeviceParams(deviceId, params, token, 30_000).catch((err) => {
				if (err instanceof DeviceRejectionError) {
					this.rollbackKeys(deviceId, keys, entries);
					toast.error(`Device rejected: ${err.message}`);
				} else if ((err as { name?: string })?.name === 'TypeError') {
					this.rollbackKeys(deviceId, keys, entries);
					toast.error('No network connection. Please check your internet and try again.');
				}
				// Abort, timeout, 5xx — device likely processed the write.
			});

			// Optimistic confirm: show the checkmark as soon as the debounce fires.
			// User's perceived budget is ~4 s (match the refresh button). Waiting on
			// the v0 POST response or a v1 readback adds 2-4 s of dead time on top
			// of the debounce — that was the 20 s spinner regression.
			this.confirmKeys(deviceId, keys, entries);

			// Background reconciliation: read back via the fast v1 async API and,
			// if any key diverges, downgrade to a conflict toast + UI rollback.
			// Non-blocking — the user already sees success.
			void this.verifyWrite(deviceId, keys, entries, baselineAtPushTime, token).then(
				(result) => {
					if (result.conflicts.length > 0) {
						this.handleConflicts(deviceId, result.conflicts, entries);
					}
				}
			);
		} catch {
			// Token error or unexpected — confirm optimistically
			this.confirmKeys(deviceId, keys, entries);
		} finally {
			this.flushing[deviceId] = false;
		}
	}

	/** Read back pushed keys from device via v1 async API to verify the write.
	 *  Detects conflicts: if deviceValue differs from desiredValue AND from the
	 *  baseline we held when we fired the push, the device changed the setting
	 *  independently — that's a real conflict. If it equals the baseline, the
	 *  write simply hasn't applied yet.
	 *
	 *  Decoding: use the schema-authoritative `entry.paramType` (not the
	 *  readback's `item.type`). When v1 omits `type`, decodeParamValue falls
	 *  back to 'String', which mis-decodes Bool ("1" stays a string) and
	 *  causes false-positive conflicts when compared against the boolean
	 *  desiredValue.
	 *
	 *  Timing budget is tight (user perceives anything past ~4s as a regression):
	 *  one short settle, single read. If we can't confirm, fall back to
	 *  optimistic confirm — periodic drift detection will surface any mismatch
	 *  later. Previous 6-attempt loop added ~9s to every push. */
	private async verifyWrite(
		deviceId: string,
		keys: string[],
		entries: Record<string, BatchEntry>,
		baselineAtPushTime: Record<string, unknown>,
		token: string
	): Promise<{ verified: boolean; conflicts: Array<{ key: string; deviceValue: unknown }> }> {
		await new Promise((r) => setTimeout(r, VERIFY_SETTLE_MS));
		for (let attempt = 0; attempt < VERIFY_MAX_ATTEMPTS; attempt++) {
			if (attempt > 0) {
				await new Promise((r) => setTimeout(r, VERIFY_POLL_INTERVAL_MS));
			}

			try {
				const response = await fetchSettingsAsync(deviceId, keys, token);
				if (!response.items) continue;

				let allMatch = true;
				const conflicts: Array<{ key: string; deviceValue: unknown }> = [];

				for (const item of response.items) {
					if (!item.key || item.value === undefined) continue;
					const entry = entries[item.key];
					if (!entry) continue;
					const deviceValue = decodeParamValue({
						key: item.key,
						value: item.value,
						type: entry.paramType as typeof item.type
					});

					if (this.valuesEqual(deviceValue, entry.desiredValue)) {
						continue; // Write applied successfully
					}

					// Compare readback against the baseline we held when the
					// push fired. Mismatch vs both desiredValue AND baseline
					// means the device changed it independently → conflict.
					// Equal to baseline → write pending, not a conflict.
					const baselineVal = baselineAtPushTime[item.key];
					if (!this.valuesEqual(deviceValue, baselineVal)) {
						conflicts.push({ key: item.key, deviceValue });
					}

					allMatch = false;
				}

				// If we found conflicts, return immediately — device wins
				if (conflicts.length > 0) {
					return { verified: false, conflicts };
				}

				if (allMatch && response.items.length > 0) {
					return { verified: true, conflicts: [] };
				}
			} catch {
				// Read failed — retry
			}
		}
		return { verified: false, conflicts: [] };
	}

	/** Handle keys where the device has a different value than what was pushed.
	 *  Device is source of truth: roll back UI to the device's actual value.
	 *
	 *  Pre-rollback filter: drop any conflict whose `deviceValue` now equals
	 *  the CURRENT driftStore baseline (baseline may have updated between
	 *  verifyWrite's readback and this handler firing). Such cases are not
	 *  real user conflicts — they're stale-readback races. Without this
	 *  filter, a delayed v1 readback of an eventually-applied write can still
	 *  trip the rollback path. */
	private handleConflicts(
		deviceId: string,
		conflicts: Array<{ key: string; deviceValue: unknown }>,
		entries: Record<string, BatchEntry>
	): void {
		const currentBaseline = driftStore.getBaseline(deviceId);
		const real = conflicts.filter((c) => {
			if (!Object.prototype.hasOwnProperty.call(currentBaseline, c.key)) return true;
			return !this.valuesEqual(c.deviceValue, currentBaseline[c.key]);
		});
		if (real.length === 0) return;

		const values = deviceState.deviceValues[deviceId];
		for (const { key, deviceValue } of real) {
			// Roll back UI to device's actual value
			if (values) values[key] = deviceValue;
			this.setKeyState(deviceId, key, 'failed');
			pushStateStore.endPush(deviceId, key);

			// Update cache + drift baseline to reflect device reality
			const gitCommit = (deviceState.deviceValues[deviceId]?.['GitCommit'] as string) || '';
			if (gitCommit) updateCachedValue(deviceId, gitCommit, key, deviceValue);
			const baseline = driftStore.getBaseline(deviceId);
			if (Object.keys(baseline).length > 0) {
				driftStore.updateBaseline(deviceId, { ...baseline, [key]: deviceValue });
			}
			driftStore.resolveKeys(deviceId, [key]);
		}
		this.removeKeys(
			deviceId,
			real.map((c) => c.key)
		);

		// Notify user
		if (real.length === 1) {
			const title = this.getSettingTitle(deviceId, real[0]!.key);
			toast.warning(`"${title}" was changed on the device. Your change was not applied.`);
		} else {
			toast.warning(
				`${real.length} settings were changed on the device. Your changes were not applied.`
			);
		}
	}

	/** Look up human-readable title for a setting key from the schema. */
	private getSettingTitle(deviceId: string, key: string): string {
		const schema = schemaState.schemas[deviceId];
		if (!schema) return key;
		for (const panel of schema.panels ?? []) {
			for (const item of panel.items ?? []) {
				if (item.key === key) return item.title || key;
			}
			for (const sp of panel.sub_panels ?? []) {
				for (const item of sp.items) {
					if (item.key === key) return item.title || key;
				}
			}
			for (const sec of panel.sections ?? []) {
				for (const item of sec.items) {
					if (item.key === key) return item.title || key;
				}
				for (const sp of sec.sub_panels ?? []) {
					for (const item of sp.items) {
						if (item.key === key) return item.title || key;
					}
				}
			}
		}
		return key;
	}

	/** Mark keys as confirmed, update cache, remove from queue. */
	private confirmKeys(deviceId: string, keys: string[], entries: Record<string, BatchEntry>): void {
		const gitCommit = (deviceState.deviceValues[deviceId]?.['GitCommit'] as string) || '';
		for (const k of keys) {
			this.setKeyState(deviceId, k, 'confirmed');
			pushStateStore.endPush(deviceId, k);
			if (gitCommit) updateCachedValue(deviceId, gitCommit, k, entries[k]!.desiredValue);
			const baseline = driftStore.getBaseline(deviceId);
			if (Object.keys(baseline).length > 0) {
				driftStore.updateBaseline(deviceId, { ...baseline, [k]: entries[k]!.desiredValue });
			}
			driftStore.resolveKeys(deviceId, [k]);
		}
		this.removeKeys(deviceId, keys);
		setTimeout(() => {
			for (const k of keys) this.clearKeyState(deviceId, k, 'confirmed');
		}, CONFIRMED_CLEAR_MS);

		// Refresh capabilities so dependent settings update their enablement
		// (e.g., toggling ICBM updates has_icbm capability → Custom ACC enables)
		logtoClient?.getIdToken().then((token) => {
			if (token) schemaState.refreshCapabilities(deviceId, token);
		});
	}

	/** Roll back keys to previous values, mark as failed. */
	private rollbackKeys(
		deviceId: string,
		keys: string[],
		entries: Record<string, BatchEntry>
	): void {
		const values = deviceState.deviceValues[deviceId];
		if (values) {
			for (const k of keys) values[k] = entries[k]!.previousValue;
		}
		for (const k of keys) {
			this.setKeyState(deviceId, k, 'failed');
			pushStateStore.endPush(deviceId, k);
		}
		this.removeKeys(deviceId, keys);
	}

	/** Handle a definite pre-send failure (no token, etc.). */
	private handleDefiniteFailure(
		deviceId: string,
		keys: string[],
		entries: Record<string, BatchEntry>,
		message: string
	): void {
		this.rollbackKeys(deviceId, keys, entries);
		toast.error(message);
	}

	/** Get the current state for a specific key. */
	getKeyState(deviceId: string, key: string): KeyState | undefined {
		void this.version;
		return this.states[deviceId]?.[key];
	}

	/** Count of pending changes for a device. */
	getPendingCount(deviceId: string): number {
		void this.version;
		const s = this.states[deviceId];
		if (!s) return 0;
		return Object.values(s).filter((v) => v === 'pending').length;
	}

	/** True if there are any pending or syncing entries for a device (debounce or API in flight). */
	isActive(deviceId: string): boolean {
		void this.version;
		const s = this.states[deviceId];
		if (!s) return false;
		return Object.values(s).some((v) => v === 'pending' || v === 'syncing');
	}

	/** True if a specific key has a pending or syncing change (user's optimistic value should be preserved). */
	hasPendingKey(deviceId: string, key: string): boolean {
		void this.version;
		const state = this.states[deviceId]?.[key];
		return state === 'pending' || state === 'syncing';
	}

	// -- Reconnect/refresh conflict resolution -------------------------------

	/** True if the debounce is paused awaiting user resolution of conflicts. */
	isPaused(deviceId: string): boolean {
		void this.version;
		return !!this.paused[deviceId];
	}

	/** Snapshot of conflicts awaiting user resolution. Keyed by param key. */
	getConflicts(deviceId: string): DeviceConflicts {
		void this.version;
		return this.conflicts[deviceId] ?? {};
	}

	getConflictCount(deviceId: string): number {
		void this.version;
		const c = this.conflicts[deviceId];
		return c ? Object.keys(c).length : 0;
	}

	/** Apply the user's queued value for one conflicted key. Removes the key
	 *  from the conflict list; if no more conflicts remain, resumes the
	 *  debounce with a fresh 4s countdown per spec. */
	resolveApply(deviceId: string, key: string): void {
		const c = this.conflicts[deviceId];
		if (!c || !c[key]) return;
		delete c[key];
		this.bump();
		if (Object.keys(c).length === 0) {
			this.paused[deviceId] = false;
			if (this.queues[deviceId] && Object.keys(this.queues[deviceId]).length > 0) {
				this.resetTimer(deviceId);
			}
		}
	}

	/** Keep the device's value for one conflicted key. Drops the key from the
	 *  queue, reverts the optimistic UI to the device baseline, and unpauses
	 *  (with a fresh 4s countdown) once all conflicts are cleared. */
	resolveKeep(deviceId: string, key: string): void {
		const c = this.conflicts[deviceId];
		if (!c || !c[key]) return;
		const deviceValue = c[key].deviceValue;
		const values = deviceState.deviceValues[deviceId];
		if (values) values[key] = deviceValue;
		delete c[key];
		this.cancel(deviceId, key);
		this.bump();
		if (Object.keys(c).length === 0) {
			this.paused[deviceId] = false;
			if (this.queues[deviceId] && Object.keys(this.queues[deviceId]).length > 0) {
				this.resetTimer(deviceId);
			}
		}
	}

	resolveApplyAll(deviceId: string): void {
		const c = this.conflicts[deviceId];
		if (!c) return;
		for (const key of Object.keys(c)) this.resolveApply(deviceId, key);
	}

	resolveKeepAll(deviceId: string): void {
		const c = this.conflicts[deviceId];
		if (!c) return;
		for (const key of Object.keys(c)) this.resolveKeep(deviceId, key);
	}

	/** Invoked by driftStore whenever a baseline changes. Rebuilds the
	 *  per-device conflict map against the current queue; pauses debounce
	 *  if any queued desiredValue diverges from the fresh baseline. */
	private checkConflictsAgainstBaseline(deviceId: string): void {
		const queue = this.queues[deviceId];
		if (!queue || Object.keys(queue).length === 0) return;
		const baseline = driftStore.getBaseline(deviceId);
		if (Object.keys(baseline).length === 0) return;

		if (!this.conflicts[deviceId]) this.conflicts[deviceId] = {};
		const cmap = this.conflicts[deviceId]!;

		let changed = false;
		for (const key of Object.keys(queue)) {
			if (!Object.prototype.hasOwnProperty.call(baseline, key)) {
				// Baseline has no value for this key — can't judge conflict.
				if (cmap[key]) {
					delete cmap[key];
					changed = true;
				}
				continue;
			}
			const entry = queue[key]!;
			if (!this.valuesEqual(entry.desiredValue, baseline[key])) {
				const prev = cmap[key];
				if (
					!prev ||
					!this.valuesEqual(prev.deviceValue, baseline[key]) ||
					!this.valuesEqual(prev.yourValue, entry.desiredValue)
				) {
					cmap[key] = {
						yourValue: entry.desiredValue,
						deviceValue: baseline[key],
						paramType: entry.paramType
					};
					changed = true;
				}
			} else if (cmap[key]) {
				// Baseline now agrees with queued value → not a conflict
				delete cmap[key];
				changed = true;
			}
		}

		if (Object.keys(cmap).length > 0) {
			if (!this.paused[deviceId]) {
				this.paused[deviceId] = true;
				this.clearTimer(deviceId);
				changed = true;
			}
		} else if (this.paused[deviceId]) {
			this.paused[deviceId] = false;
			changed = true;
			if (Object.keys(queue).length > 0) this.resetTimer(deviceId);
		}

		if (changed) this.bump();
	}

	/** Remove a key from the pending batch before it flushes.
	 *  Queues are plain records (not $state) so `delete` is safe and visible
	 *  to JS immediately; the version bump notifies any derived readers.
	 *  Also clears `pushStateStore` so the derived `pushState` in
	 *  SchemaItemRenderer transitions away from 'pending' on the exact tick
	 *  the user reverts. */
	cancel(deviceId: string, key: string): void {
		const queue = this.queues[deviceId];
		if (queue && Object.prototype.hasOwnProperty.call(queue, key)) {
			delete queue[key];
		}
		// Always clear the timer when the queue is empty — guards against
		// orphan timers if cancel() is called for a key that wasn't queued
		// (e.g. SchemaItemRenderer calls cancel + revert defensively).
		if (!queue || Object.keys(queue).length === 0) this.clearTimer(deviceId);
		this.clearKeyState(deviceId, key);
		pushStateStore.endPush(deviceId, key);
	}

	/** Revert a pending (not yet flushed) change: restore the original device
	 *  value into deviceValues and cancel the queued batch entry so the
	 *  debounce does not fire. Mirrors `pendingChanges.revert()` for the
	 *  offline path — SchemaItemRenderer calls both, whichever holds the
	 *  change for this key. Returns true if an entry existed and was reverted. */
	revert(deviceId: string, key: string, deviceValues: Record<string, unknown> | undefined): boolean {
		const entry = this.queues[deviceId]?.[key];
		if (!entry) return false;
		if (deviceValues) deviceValues[key] = entry.previousValue;
		this.cancel(deviceId, key);
		return true;
	}

	/** Clean up timers when switching devices. */
	cleanup(deviceId: string): void {
		this.clearTimer(deviceId);
	}

	// -- Internal helpers ----------------------------------------------------

	private resetTimer(deviceId: string): void {
		this.clearTimer(deviceId);
		// While paused (conflicts awaiting user resolution), no timer runs —
		// flush is gated on user action. New enqueues/reverts still mutate the
		// queue; they just don't auto-flush until the user clears conflicts.
		if (this.paused[deviceId]) return;
		this.timers[deviceId] = setTimeout(() => this.flush(deviceId), DEBOUNCE_MS);
	}

	private clearTimer(deviceId: string): void {
		if (this.timers[deviceId]) {
			clearTimeout(this.timers[deviceId]);
			delete this.timers[deviceId];
		}
	}

	private setKeyState(deviceId: string, key: string, state: KeyState): void {
		if (!this.states[deviceId]) this.states[deviceId] = {};
		this.states[deviceId][key] = state;
		this.bump();
	}

	/** Clear a key's state only if it still matches the expected value. */
	private clearKeyState(deviceId: string, key: string, ifState?: KeyState): void {
		const bucket = this.states[deviceId];
		if (!bucket) return;
		const current = bucket[key];
		if (ifState && current !== ifState) return;
		delete bucket[key];
		this.bump();
	}

	private removeKeys(deviceId: string, keys: string[]): void {
		const queue = this.queues[deviceId];
		if (!queue) return;
		for (const k of keys) delete queue[k];
		this.bump();
	}

	/** Flush all devices (beforeunload / visibilitychange). */
	private flushAll(): void {
		for (const id of Object.keys(this.queues)) {
			const q = this.queues[id];
			if (q && Object.keys(q).length > 0) this.flush(id);
		}
	}
}

export const batchPush = new BatchPushStore();
