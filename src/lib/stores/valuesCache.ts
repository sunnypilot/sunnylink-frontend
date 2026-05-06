/**
 * localStorage-backed cache for device param values.
 *
 * Implements stale-while-revalidate: cached values are shown immediately
 * on page load, then background-refreshed from the device.
 *
 * Keyed by deviceId + gitCommit to invalidate on software update.
 */

const CACHE_PREFIX = 'sunnylink_values_';
const COMMIT_PREFIX = 'sunnylink_commit_';
const CACHE_MAX_AGE_MS = 24 * 60 * 60 * 1000; // 24 hours
const MAX_ENTRIES_PER_DEVICE = 5;

/**
 * Store the last-known gitCommit for a device (keyed by deviceId alone).
 * Breaks the chicken-and-egg: we can load cached values without needing
 * schema or deviceValues to already be populated.
 */
export function getLastKnownCommit(deviceId: string): string | null {
	if (typeof localStorage === 'undefined') return null;
	return localStorage.getItem(`${COMMIT_PREFIX}${deviceId}`);
}

export function setLastKnownCommit(deviceId: string, commit: string): void {
	if (typeof localStorage === 'undefined' || !commit) return;
	localStorage.setItem(`${COMMIT_PREFIX}${deviceId}`, commit);
}

interface CacheEntry {
	values: Record<string, unknown>;
	timestamp: number;
	version: string; // GitCommit
}

function cacheKey(deviceId: string, gitCommit: string): string {
	return `${CACHE_PREFIX}${deviceId}_${gitCommit}`;
}

/**
 * Load cached values for a device. Returns null if no valid cache exists.
 */
export function loadCachedValues(
	deviceId: string,
	gitCommit: string
): Record<string, unknown> | null {
	if (typeof localStorage === 'undefined' || !gitCommit) return null;

	try {
		const key = cacheKey(deviceId, gitCommit);
		const raw = localStorage.getItem(key);
		if (!raw) return null;

		const entry: CacheEntry = JSON.parse(raw);

		// Check TTL
		if (Date.now() - entry.timestamp > CACHE_MAX_AGE_MS) {
			localStorage.removeItem(key);
			return null;
		}

		// Check version match
		if (entry.version !== gitCommit) {
			localStorage.removeItem(key);
			return null;
		}

		return entry.values;
	} catch {
		return null;
	}
}

/**
 * Save values to cache. Evicts oldest entries if over limit.
 */
export function saveCachedValues(
	deviceId: string,
	gitCommit: string,
	values: Record<string, unknown>
): void {
	if (typeof localStorage === 'undefined' || !gitCommit) return;

	try {
		const entry: CacheEntry = {
			values,
			timestamp: Date.now(),
			version: gitCommit
		};

		const key = cacheKey(deviceId, gitCommit);
		localStorage.setItem(key, JSON.stringify(entry));

		// Evict old entries for this device
		evictOldEntries(deviceId);
	} catch {
		// localStorage full or other error — silently ignore
	}
}

/**
 * Update a single key in the cache (after push success).
 * Avoids re-serializing the entire cache.
 */
export function updateCachedValue(
	deviceId: string,
	gitCommit: string,
	paramKey: string,
	value: unknown
): void {
	if (typeof localStorage === 'undefined' || !gitCommit) return;

	try {
		const key = cacheKey(deviceId, gitCommit);
		const raw = localStorage.getItem(key);
		if (!raw) return;

		const entry: CacheEntry = JSON.parse(raw);
		entry.values[paramKey] = value;
		entry.timestamp = Date.now();
		localStorage.setItem(key, JSON.stringify(entry));
	} catch {
		// Silently ignore
	}
}

/**
 * Remove all cached values for a device (e.g., on deregister).
 */
export function clearDeviceCache(deviceId: string): void {
	if (typeof localStorage === 'undefined') return;

	const prefix = `${CACHE_PREFIX}${deviceId}_`;
	const keysToRemove: string[] = [];

	for (let i = 0; i < localStorage.length; i++) {
		const key = localStorage.key(i);
		if (key?.startsWith(prefix)) {
			keysToRemove.push(key);
		}
	}

	for (const key of keysToRemove) {
		localStorage.removeItem(key);
	}
}

function evictOldEntries(deviceId: string): void {
	const prefix = `${CACHE_PREFIX}${deviceId}_`;
	const entries: { key: string; timestamp: number }[] = [];

	for (let i = 0; i < localStorage.length; i++) {
		const key = localStorage.key(i);
		if (key?.startsWith(prefix)) {
			try {
				const raw = localStorage.getItem(key);
				if (raw) {
					const entry: CacheEntry = JSON.parse(raw);
					entries.push({ key, timestamp: entry.timestamp });
				}
			} catch {
				// Corrupt entry — remove it
				if (key) localStorage.removeItem(key);
			}
		}
	}

	// Sort oldest first, remove excess
	if (entries.length > MAX_ENTRIES_PER_DEVICE) {
		entries.sort((a, b) => a.timestamp - b.timestamp);
		const toRemove = entries.slice(0, entries.length - MAX_ENTRIES_PER_DEVICE);
		for (const entry of toRemove) {
			localStorage.removeItem(entry.key);
		}
	}
}
