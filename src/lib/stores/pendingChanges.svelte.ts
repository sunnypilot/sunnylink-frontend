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
const CONFIRMED_PURGE_DELAY_MS = 30_000; // auto-remove confirmed entries after 30s

export type ChangeStatus = 'pending' | 'pushing' | 'confirmed' | 'failed';

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

	/** Load pending changes for a device from localStorage */
	load(deviceId: string): void {
		if (!this._changes[deviceId]) {
			this._changes[deviceId] = loadFromStorage(deviceId);
		}
	}

	/** Get all pending changes for a device.
	 *  Safe for $derived — reads state without mutation.
	 *  Falls back to direct localStorage read if not yet loaded. */
	getAll(deviceId: string): PendingChange[] {
		return this._changes[deviceId] ?? loadFromStorage(deviceId);
	}

	/** Get only changes with a specific status */
	getByStatus(deviceId: string, status: ChangeStatus): PendingChange[] {
		return this.getAll(deviceId).filter((c) => c.status === status);
	}

	/** Check if any changes are pending or pushing */
	hasPending(deviceId: string): boolean {
		return this.getAll(deviceId).some((c) => c.status === 'pending' || c.status === 'pushing');
	}

	/** Count of pending + pushing changes */
	pendingCount(deviceId: string): number {
		return this.getAll(deviceId).filter((c) => c.status === 'pending' || c.status === 'pushing')
			.length;
	}

	/** Count of failed changes */
	failedCount(deviceId: string): number {
		return this.getAll(deviceId).filter((c) => c.status === 'failed').length;
	}

	/** Enqueue a new change or update existing one for the same key */
	enqueue(deviceId: string, key: string, desiredValue: unknown, previousValue: unknown): void {
		this.load(deviceId);
		const changes = this._changes[deviceId] ?? [];

		// Replace existing entry for the same key
		const idx = changes.findIndex((c) => c.key === key);
		const entry: PendingChange = {
			key,
			desiredValue,
			previousValue,
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
}

export const pendingChanges = new PendingChangesStore();
