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
const VERIFY_POLL_INTERVAL_MS = 1_500;
const VERIFY_MAX_ATTEMPTS = 6; // ~9s max verification time

export type KeyState = 'pending' | 'syncing' | 'confirmed' | 'failed';

export interface BatchEntry {
	desiredValue: unknown;
	previousValue: unknown;
	encodedValue: string;
	paramType: string;
	timestamp: number;
}

type DeviceQueue = Record<string, BatchEntry>;

class BatchPushStore {
	private queues: Record<string, DeviceQueue> = $state({});
	private states: Record<string, Record<string, KeyState>> = $state({});
	private timers: Record<string, ReturnType<typeof setTimeout>> = {};
	private flushing: Record<string, boolean> = {};

	constructor() {
		if (typeof window !== 'undefined') {
			window.addEventListener('beforeunload', () => this.flushAll());
			document.addEventListener('visibilitychange', () => {
				if (document.visibilityState === 'hidden') this.flushAll();
			});
		}
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

		// Preserve the TRUE original value from the first enqueue for this key.
		// On re-flips, previousValue from the caller is the current (already-changed)
		// optimistic value — not the original device value.
		const existing = this.queues[deviceId][key];
		const originalValue = existing ? existing.previousValue : previousValue;

		// Net-change detection: user reverted to original → cancel the key
		if (this.valuesEqual(newValue, originalValue)) {
			this.cancel(deviceId, key);
			const remaining = Object.keys(this.queues[deviceId] ?? {}).length;
			if (remaining === 0) this.clearTimer(deviceId);
			else this.resetTimer(deviceId);
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
		this.resetTimer(deviceId);
	}

	/** Shallow equality for param values (handles primitives and simple objects). */
	private valuesEqual(a: unknown, b: unknown): boolean {
		if (a === b) return true;
		if (typeof a !== typeof b) return false;
		if (typeof a === 'object' && a !== null && b !== null) {
			return JSON.stringify(a) === JSON.stringify(b);
		}
		return false;
	}

	/** Immediately flush all pending changes for a device.
	 *  Dispatches the v0 POST (fire-and-forget for the slow response), then verifies
	 *  the write by reading back the values via the fast v1 async API.
	 *  Confirmation happens when the read-back matches — identical timing for all params. */
	async flush(deviceId: string): Promise<void> {
		this.clearTimer(deviceId);
		const queue = this.queues[deviceId];
		if (!queue || Object.keys(queue).length === 0) return;
		if (this.flushing[deviceId]) return;

		this.flushing[deviceId] = true;
		const keys = Object.keys(queue);
		const entries = { ...queue };

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

			// 1. Fire the v0 POST — don't await the slow backend response.
			//    Handle definite failures (4xx, no network) asynchronously.
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

			// 2. Verify the write by reading back values via the fast v1 async API.
			//    This completes in ~2s for ALL params regardless of v0 POST timing.
			const result = await this.verifyWrite(deviceId, keys, entries, token);

			if (result.conflicts.length > 0) {
				// Device has different values than what we pushed — device wins.
				// Roll back conflicted keys to the device's actual values.
				this.handleConflicts(deviceId, result.conflicts, entries);
				// Confirm any non-conflicted keys normally
				const confirmedKeys = keys.filter((k) => !result.conflicts.some((c) => c.key === k));
				if (confirmedKeys.length > 0) {
					this.confirmKeys(deviceId, confirmedKeys, entries);
				}
			} else if (result.verified) {
				this.confirmKeys(deviceId, keys, entries);
			} else {
				// Verification timed out — confirm optimistically, prefetch will correct if wrong.
				this.confirmKeys(deviceId, keys, entries);
			}
		} catch {
			// Token error or unexpected — confirm optimistically
			this.confirmKeys(deviceId, keys, entries);
		} finally {
			this.flushing[deviceId] = false;
		}
	}

	/** Read back pushed keys from device via v1 async API to verify the write.
	 *  Detects conflicts: if device value differs from desiredValue AND from
	 *  previousValue, the device changed the setting independently — conflict. */
	private async verifyWrite(
		deviceId: string,
		keys: string[],
		entries: Record<string, BatchEntry>,
		token: string
	): Promise<{ verified: boolean; conflicts: Array<{ key: string; deviceValue: unknown }> }> {
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
						type: item.type ?? 'String'
					});

					if (this.valuesEqual(deviceValue, entry.desiredValue)) {
						continue; // Write applied successfully
					}

					// Device value differs from what we pushed.
					// Check if it also differs from the previous baseline —
					// if so, the device changed it independently (conflict).
					// If it equals previousValue, the write just hasn't applied yet.
					if (!this.valuesEqual(deviceValue, entry.previousValue)) {
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
	 *  Device is source of truth: roll back UI to the device's actual value. */
	private handleConflicts(
		deviceId: string,
		conflicts: Array<{ key: string; deviceValue: unknown }>,
		entries: Record<string, BatchEntry>
	): void {
		const values = deviceState.deviceValues[deviceId];
		for (const { key, deviceValue } of conflicts) {
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
			conflicts.map((c) => c.key)
		);

		// Notify user
		if (conflicts.length === 1) {
			const entry = entries[conflicts[0]!.key];
			const title = this.getSettingTitle(deviceId, conflicts[0]!.key);
			toast.warning(`"${title}" was changed on the device. Your change was not applied.`);
		} else {
			toast.warning(
				`${conflicts.length} settings were changed on the device. Your changes were not applied.`
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
		return this.states[deviceId]?.[key];
	}

	/** Count of pending changes for a device. */
	getPendingCount(deviceId: string): number {
		const s = this.states[deviceId];
		if (!s) return 0;
		return Object.values(s).filter((v) => v === 'pending').length;
	}

	/** True if there are any pending or syncing entries for a device (debounce or API in flight). */
	isActive(deviceId: string): boolean {
		const s = this.states[deviceId];
		if (!s) return false;
		return Object.values(s).some((v) => v === 'pending' || v === 'syncing');
	}

	/** True if a specific key has a pending or syncing change (user's optimistic value should be preserved). */
	hasPendingKey(deviceId: string, key: string): boolean {
		const state = this.states[deviceId]?.[key];
		return state === 'pending' || state === 'syncing';
	}

	/** Remove a key from the pending batch before it flushes. */
	cancel(deviceId: string, key: string): void {
		const queue = this.queues[deviceId];
		if (queue) {
			delete queue[key];
			if (Object.keys(queue).length === 0) this.clearTimer(deviceId);
		}
		this.clearKeyState(deviceId, key);
	}

	/** Clean up timers when switching devices. */
	cleanup(deviceId: string): void {
		this.clearTimer(deviceId);
	}

	// -- Internal helpers ----------------------------------------------------

	private resetTimer(deviceId: string): void {
		this.clearTimer(deviceId);
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
		this.states[deviceId] = { ...this.states[deviceId], [key]: state };
	}

	/** Clear a key's state only if it still matches the expected value. */
	private clearKeyState(deviceId: string, key: string, ifState?: KeyState): void {
		const current = this.states[deviceId]?.[key];
		if (ifState && current !== ifState) return;
		if (!this.states[deviceId]) return;
		const next = { ...this.states[deviceId] };
		delete next[key];
		this.states[deviceId] = next;
	}

	private removeKeys(deviceId: string, keys: string[]): void {
		const queue = this.queues[deviceId];
		if (!queue) return;
		const next = { ...queue };
		for (const k of keys) delete next[k];
		this.queues[deviceId] = next;
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
