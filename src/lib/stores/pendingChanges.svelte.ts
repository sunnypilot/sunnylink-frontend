/**
 * Persistent queue of desired-state setting changes per device.
 *
 * Enables offline queueing: users can toggle settings while the device is off,
 * changes persist in localStorage, and auto-flush when the device reconnects.
 *
 * Follows the Apple MDM "pending profile" pattern — each change has a status
 * lifecycle: pending → pushing → confirmed/failed.
 */

const STORAGE_PREFIX = 'sunnylink_pending_';
const MAX_PENDING_PER_DEVICE = 50;
const CONFIRMED_PURGE_DELAY_MS = 5_000; // auto-remove confirmed entries after 5s

export type ChangeStatus = 'pending' | 'pushing' | 'confirmed' | 'failed' | 'blocked_onroad';

export interface PendingChange {
	key: string;
	desiredValue: unknown;
	previousValue: unknown;
	timestamp: number;
	status: ChangeStatus;
	attempts: number;
	lastError?: string;
}

function storageKey(deviceId: string): string {
	return `${STORAGE_PREFIX}${deviceId}`;
}

function loadFromStorage(deviceId: string): PendingChange[] {
	if (typeof localStorage === 'undefined') return [];
	try {
		const raw = localStorage.getItem(storageKey(deviceId));
		if (!raw) return [];
		const parsed = JSON.parse(raw);
		return Array.isArray(parsed) ? parsed : [];
	} catch {
		return [];
	}
}

function saveToStorage(deviceId: string, changes: PendingChange[]): void {
	if (typeof localStorage === 'undefined') return;
	try {
		if (changes.length === 0) {
			localStorage.removeItem(storageKey(deviceId));
		} else {
			localStorage.setItem(storageKey(deviceId), JSON.stringify(changes));
		}
	} catch {
		// localStorage full — silently ignore
	}
}

class PendingChangesStore {
	/** Reactive map: deviceId → PendingChange[] */
	private _changes: Record<string, PendingChange[]> = $state({});

	/** Guard to prevent concurrent flushes per device */
	private _flushing: Record<string, boolean> = {};

	/** Load pending changes for a device from localStorage.
	 *  Purges stale 'confirmed' entries — they're transient feedback
	 *  that shouldn't survive a page reload. */
	load(deviceId: string): void {
		if (!this._changes[deviceId]) {
			const loaded = loadFromStorage(deviceId);
			const cleaned = loaded.filter((c) => c.status !== 'confirmed');
			if (cleaned.length !== loaded.length) {
				saveToStorage(deviceId, cleaned);
			}
			this._changes[deviceId] = cleaned;
		}
	}

	/** Get all pending changes for a device.
	 *  Safe for $derived — reads state without mutation.
	 *  Falls back to localStorage (filtering stale confirmed entries). */
	getAll(deviceId: string): PendingChange[] {
		const cached = this._changes[deviceId];
		if (cached) return cached;
		// Direct read from localStorage, filtering confirmed entries
		// (confirmed entries are transient and shouldn't survive a reload)
		return loadFromStorage(deviceId).filter((c) => c.status !== 'confirmed');
	}

	/** Get only changes with a specific status */
	getByStatus(deviceId: string, status: ChangeStatus): PendingChange[] {
		return this.getAll(deviceId).filter((c) => c.status === status);
	}

	/** Check if any changes are pending, pushing, or blocked */
	hasPending(deviceId: string): boolean {
		return this.getAll(deviceId).some(
			(c) => c.status === 'pending' || c.status === 'pushing' || c.status === 'blocked_onroad'
		);
	}

	/** Count of pending + pushing + blocked changes */
	pendingCount(deviceId: string): number {
		return this.getAll(deviceId).filter(
			(c) => c.status === 'pending' || c.status === 'pushing' || c.status === 'blocked_onroad'
		).length;
	}

	/** Count of blocked-onroad changes */
	blockedCount(deviceId: string): number {
		return this.getAll(deviceId).filter((c) => c.status === 'blocked_onroad').length;
	}

	/** Count of failed changes */
	failedCount(deviceId: string): number {
		return this.getAll(deviceId).filter((c) => c.status === 'failed').length;
	}

	/** Enqueue a new change or update existing one for the same key.
	 *  If the user reverts to the original value, the entry is removed entirely. */
	enqueue(deviceId: string, key: string, desiredValue: unknown, previousValue: unknown): void {
		this.load(deviceId);
		const changes = this._changes[deviceId] ?? [];

		const idx = changes.findIndex((c) => c.key === key);

		// Preserve the true original value from the first queued entry
		const existingEntry = idx >= 0 ? changes[idx] : undefined;
		const originalValue = existingEntry ? existingEntry.previousValue : previousValue;

		// If user reverted to the original value, remove the entry entirely
		if (this.valuesEqual(desiredValue, originalValue)) {
			if (idx >= 0) {
				changes.splice(idx, 1);
				this._changes[deviceId] = [...changes];
				saveToStorage(deviceId, changes);
			}
			return;
		}

		const entry: PendingChange = {
			key,
			desiredValue,
			previousValue: originalValue,
			timestamp: Date.now(),
			status: 'pending',
			attempts: 0
		};

		if (idx >= 0) {
			changes[idx] = entry;
		} else {
			// Enforce max queue size
			if (changes.length >= MAX_PENDING_PER_DEVICE) {
				// Remove oldest confirmed/failed first, then oldest pending
				const removeIdx =
					changes.findIndex((c) => c.status === 'confirmed' || c.status === 'failed') ??
					changes.findIndex((c) => c.status === 'pending');
				if (removeIdx >= 0) changes.splice(removeIdx, 1);
			}
			changes.push(entry);
		}

		this._changes[deviceId] = [...changes]; // trigger reactivity
		saveToStorage(deviceId, changes);
	}

	/** Compare values across types (handles string/number coercion for param values) */
	private valuesEqual(a: unknown, b: unknown): boolean {
		if (a === b) return true;
		// Handle string/number coercion (e.g., "1" vs 1, "true" vs true)
		if (String(a) === String(b)) return true;
		return false;
	}

	/** Mark a change as pushing (idempotent — skips if already pushing) */
	markPushing(deviceId: string, key: string): boolean {
		const changes = this._changes[deviceId] ?? [];
		const entry = changes.find((c) => c.key === key);
		if (!entry || entry.status === 'pushing') return false;

		entry.status = 'pushing';
		entry.attempts += 1;
		this._changes[deviceId] = [...changes];
		saveToStorage(deviceId, changes);
		return true;
	}

	/** Mark a change as confirmed. Auto-purges after delay. */
	markConfirmed(deviceId: string, key: string): void {
		const changes = this._changes[deviceId] ?? [];
		const entry = changes.find((c) => c.key === key);
		if (!entry) return;

		entry.status = 'confirmed';
		this._changes[deviceId] = [...changes];
		saveToStorage(deviceId, changes);

		// Auto-purge after delay
		setTimeout(() => this.remove(deviceId, key), CONFIRMED_PURGE_DELAY_MS);
	}

	/** Mark a change as blocked (offroad-only item while device is onroad) */
	markBlocked(deviceId: string, key: string): void {
		const changes = this._changes[deviceId] ?? [];
		const entry = changes.find((c) => c.key === key);
		if (!entry) return;

		entry.status = 'blocked_onroad';
		this._changes[deviceId] = [...changes];
		saveToStorage(deviceId, changes);
	}

	/** Unblock all blocked_onroad entries (e.g., device went offroad). Resets them to pending. */
	unblockAll(deviceId: string): void {
		const changes = this._changes[deviceId] ?? [];
		let changed = false;
		for (const entry of changes) {
			if (entry.status === 'blocked_onroad') {
				entry.status = 'pending';
				changed = true;
			}
		}
		if (changed) {
			this._changes[deviceId] = [...changes];
			saveToStorage(deviceId, changes);
		}
	}

	/** Mark a change as failed with error message */
	markFailed(deviceId: string, key: string, error: string): void {
		const changes = this._changes[deviceId] ?? [];
		const entry = changes.find((c) => c.key === key);
		if (!entry) return;

		entry.status = 'failed';
		entry.lastError = error;
		this._changes[deviceId] = [...changes];
		saveToStorage(deviceId, changes);
	}

	/** Revert a pending change: restore deviceValues to previousValue and remove from queue.
	 *  Requires a reference to the deviceState store's values map. */
	revert(deviceId: string, key: string, deviceValues: Record<string, unknown> | undefined): void {
		const change = this.getForKey(deviceId, key);
		if (!change) return;
		if (deviceValues && change.previousValue !== undefined) {
			deviceValues[key] = change.previousValue;
		}
		this.remove(deviceId, key);
	}

	/** Remove a specific change */
	remove(deviceId: string, key: string): void {
		const changes = this._changes[deviceId] ?? [];
		const filtered = changes.filter((c) => c.key !== key);
		this._changes[deviceId] = filtered;
		saveToStorage(deviceId, filtered);
	}

	/** Remove all confirmed entries for a device */
	clearConfirmed(deviceId: string): void {
		const changes = this._changes[deviceId] ?? [];
		const filtered = changes.filter((c) => c.status !== 'confirmed');
		this._changes[deviceId] = filtered;
		saveToStorage(deviceId, filtered);
	}

	/** Remove all entries for a device */
	clearAll(deviceId: string): void {
		this._changes[deviceId] = [];
		saveToStorage(deviceId, []);
	}

	/** Check if a flush is in progress for a device */
	isFlushing(deviceId: string): boolean {
		return !!this._flushing[deviceId];
	}

	/** Set flushing guard */
	setFlushing(deviceId: string, value: boolean): void {
		this._flushing[deviceId] = value;
	}

	/** Get the pending change for a specific key (if any) */
	getForKey(deviceId: string, key: string): PendingChange | undefined {
		return this.getAll(deviceId).find((c) => c.key === key);
	}

	/** Flush all pending changes to the device.
	 *  Requires a pushFn callback that handles the actual API call per entry.
	 *  When isOnroad is true, offroad-only keys are blocked (not pushed).
	 *  Returns the count of successfully flushed changes. */
	async flush(
		deviceId: string,
		pushFn: (change: PendingChange) => Promise<void>,
		options?: { isOnroad?: boolean; offroadOnlyKeys?: Set<string> }
	): Promise<number> {
		if (this._flushing[deviceId]) return 0;
		const pending = this.getByStatus(deviceId, 'pending');
		if (pending.length === 0) return 0;

		this._flushing[deviceId] = true;
		let successCount = 0;

		try {
			for (const change of pending) {
				// Block offroad-only items when device is onroad
				if (options?.isOnroad && options.offroadOnlyKeys?.has(change.key)) {
					this.markBlocked(deviceId, change.key);
					continue;
				}

				this.markPushing(deviceId, change.key);
				try {
					await pushFn(change);
					this.markConfirmed(deviceId, change.key);
					successCount++;
				} catch (e) {
					this.markFailed(deviceId, change.key, (e as Error)?.message || 'Failed');
				}
			}
		} finally {
			this._flushing[deviceId] = false;
		}

		return successCount;
	}
}

export const pendingChanges = new PendingChangesStore();
