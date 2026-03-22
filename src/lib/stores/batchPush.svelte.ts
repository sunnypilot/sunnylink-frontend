/** Batches per-device param changes, flushing as a single setDeviceParams() call after a 4s debounce. */

import { setDeviceParams, DeviceRejectionError } from '$lib/api/device';
import { encodeParamValue } from '$lib/utils/device';
import { deviceState } from '$lib/stores/device.svelte';
import { logtoClient } from '$lib/logto/auth.svelte';
import { toastState } from '$lib/stores/toast.svelte';
import { updateCachedValue } from '$lib/stores/valuesCache';
import { pushStateStore } from '$lib/stores/pushState.svelte';

const DEBOUNCE_MS = 4_000;
const CONFIRMED_CLEAR_MS = 3_000;

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
			toastState.show(`Failed to encode value for ${key}`, 'error');
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

	/** Immediately flush all pending changes for a device. */
	async flush(deviceId: string): Promise<void> {
		this.clearTimer(deviceId);
		const queue = this.queues[deviceId];
		if (!queue || Object.keys(queue).length === 0) return;
		if (this.flushing[deviceId]) return;

		this.flushing[deviceId] = true;
		const keys = Object.keys(queue);
		const entries = { ...queue };

		// Mark all as syncing
		for (const k of keys) {
			this.setKeyState(deviceId, k, 'syncing');
			pushStateStore.startPush(deviceId, k);
		}

		try {
			const token = await logtoClient?.getIdToken();
			if (!token) throw new Error('Session expired');

			const params = keys.map((k) => ({ key: k, value: entries[k]!.encodedValue }));
			await setDeviceParams(deviceId, params, token, 5_000);

			// Success: update state and cache
			const gitCommit = (deviceState.deviceValues[deviceId]?.['GitCommit'] as string) || '';
			for (const k of keys) {
				this.setKeyState(deviceId, k, 'confirmed');
				pushStateStore.endPush(deviceId, k);
				if (gitCommit) updateCachedValue(deviceId, gitCommit, k, entries[k]!.desiredValue);
			}
			this.removeKeys(deviceId, keys);

			// Auto-clear confirmed state after delay
			setTimeout(() => {
				for (const k of keys) this.clearKeyState(deviceId, k, 'confirmed');
			}, CONFIRMED_CLEAR_MS);
		} catch (err) {
			// Rollback deviceValues to previous state
			const values = deviceState.deviceValues[deviceId];
			if (values) {
				for (const k of keys) values[k] = entries[k]!.previousValue;
			}
			for (const k of keys) {
				this.setKeyState(deviceId, k, 'failed');
				pushStateStore.endPush(deviceId, k);
			}
			this.removeKeys(deviceId, keys);

			const message =
				err instanceof DeviceRejectionError
					? `Device rejected: ${err.message}`
					: (err as Error)?.message || 'Failed to push settings';
			toastState.show(message, 'error');
		} finally {
			this.flushing[deviceId] = false;
		}
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
