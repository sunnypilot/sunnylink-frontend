/**
 * Schema Store
 *
 * Manages the settings schema and capabilities state per device.
 *
 * - Schema is fetched via getParams(["SettingsSchema", "SettingsCapabilities", "GitCommit"])
 * - Version-aware caching: schema cached by deviceId + GitCommit in localStorage
 * - Capabilities are always refreshed in background (lightweight, car-dependent)
 * - Graceful fallback when device lacks SettingsSchema param (older sunnypilot versions)
 * - Capabilities refreshed after pushing settings (some params affect capabilities)
 */

import { browser } from '$app/environment';
import type { SettingsSchema, Capabilities } from '$lib/types/schema';
import { fetchSettingsAsync } from '$lib/api/device';
import { decodeParamValue } from '$lib/utils/device';
import { deviceState } from '$lib/stores/device.svelte';

const SCHEMA_CACHE_PREFIX = 'sunnylink_schema_';
const CACHE_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000; // 7 days
const CACHE_MAX_ENTRIES = 10;

interface CacheEntry {
	schema: SettingsSchema;
	version: string;
	timestamp: number;
}

class SchemaStore {
	/** Parsed schema per device */
	schemas: Record<string, SettingsSchema> = $state({});

	/** Parsed capabilities per device */
	capabilities: Record<string, Capabilities> = $state({});

	/** Schema version (GitCommit) per device */
	versions: Record<string, string> = $state({});

	/** Loading state per device */
	loading: Record<string, boolean> = $state({});

	/** Error state per device */
	errors: Record<string, string | null> = $state({});

	/** Whether schema was unavailable (device on older sunnypilot version) */
	schemaUnavailable: Record<string, boolean> = $state({});

	/**
	 * Load schema + capabilities for a device.
	 *
	 * 1. Check localStorage cache (keyed by deviceId + gitCommit)
	 * 2. If cache miss or version mismatch → fetch from device via getParams
	 * 3. Always refresh capabilities in background
	 */
	async loadSchema(deviceId: string, token: string, currentGitCommit?: string): Promise<void> {
		// Check cache
		if (browser && currentGitCommit) {
			const cached = _loadFromCache(deviceId, currentGitCommit);
			if (cached) {
				this.schemas[deviceId] = cached.schema;
				this.versions[deviceId] = cached.version;
				this.schemaUnavailable[deviceId] = false;

				// Load cached capabilities too (will be refreshed in background)
				const cachedCaps = _loadCapsFromCache(deviceId);
				if (cachedCaps) {
					this.capabilities[deviceId] = cachedCaps;
				}

				// Background refresh capabilities (they change more often than schema)
				this._refreshCapabilities(deviceId, token);
				return;
			}
		}

		// Fetch from device
		this.loading[deviceId] = true;
		this.errors[deviceId] = null;
		this.schemaUnavailable[deviceId] = false;

		try {
			const response = await fetchSettingsAsync(
				deviceId,
				['SettingsSchema', 'SettingsCapabilities', 'GitCommit'],
				token
			);

			if (response.items) {
				let fetchedVersion = currentGitCommit || '';
				let schemaFound = false;

				for (const item of response.items) {
					if (item.key === 'GitCommit' && item.value) {
						const decoded = decodeParamValue({ key: item.key, value: item.value, type: 'String' });
						if (typeof decoded === 'string') {
							fetchedVersion = decoded;
							// Also store in deviceValues so the values cache can key on it
							if (!deviceState.deviceValues[deviceId]) {
								deviceState.deviceValues[deviceId] = {};
							}
							deviceState.deviceValues[deviceId]['GitCommit'] = decoded;
						}
					}

					if (item.key === 'SettingsSchema' && item.value) {
						const decoded = decodeParamValue({ key: item.key, value: item.value, type: 'String' });
						if (typeof decoded === 'string') {
							try {
								const parsed = JSON.parse(decoded) as SettingsSchema;
								this.schemas[deviceId] = parsed;
								this.versions[deviceId] = fetchedVersion;
								schemaFound = true;

								// Cache it
								if (browser && fetchedVersion) {
									_saveToCache(deviceId, fetchedVersion, parsed);
								}
							} catch (e) {
								console.error(`Failed to parse SettingsSchema for ${deviceId}`, e);
								this.errors[deviceId] = 'Failed to parse schema';
							}
						}
					}

					if (item.key === 'SettingsCapabilities' && item.value) {
						const decoded = decodeParamValue({ key: item.key, value: item.value, type: 'String' });
						if (typeof decoded === 'string') {
							try {
								const caps = JSON.parse(decoded) as Capabilities;
								this.capabilities[deviceId] = caps;
								if (browser) {
									_saveCapsToCache(deviceId, caps);
								}
							} catch (e) {
								console.error(`Failed to parse SettingsCapabilities for ${deviceId}`, e);
							}
						}
					}
				}

				if (!schemaFound) {
					this.schemaUnavailable[deviceId] = true;
				}
			} else {
				this.errors[deviceId] = response.error || 'Failed to fetch schema';
			}
		} catch (e) {
			console.error(`Failed to load schema for ${deviceId}`, e);
			this.errors[deviceId] = 'Network error';
		} finally {
			this.loading[deviceId] = false;
		}
	}

	/**
	 * Refresh capabilities only (lightweight, no schema re-fetch).
	 * Call after pushing settings or on reconnect.
	 */
	async refreshCapabilities(deviceId: string, token: string): Promise<void> {
		await this._refreshCapabilities(deviceId, token);
	}

	/**
	 * Check if a device has a loaded schema.
	 */
	hasSchema(deviceId: string): boolean {
		return deviceId in this.schemas && !this.schemaUnavailable[deviceId];
	}

	/**
	 * Clear cached schema for a device (forces re-fetch on next load).
	 */
	clearCache(deviceId: string): void {
		delete this.schemas[deviceId];
		delete this.capabilities[deviceId];
		delete this.versions[deviceId];
		delete this.schemaUnavailable[deviceId];
		if (browser) {
			_evictDeviceCache(deviceId);
		}
	}

	// ── Internal ──────────────────────────────────────────────────────────────

	async _refreshCapabilities(deviceId: string, token: string): Promise<void> {
		try {
			const response = await fetchSettingsAsync(deviceId, ['SettingsCapabilities'], token);

			if (response.items) {
				const capsItem = response.items.find((i) => i.key === 'SettingsCapabilities');
				if (capsItem?.value) {
					const decoded = decodeParamValue({
						key: capsItem.key!,
						value: capsItem.value,
						type: 'String'
					});
					if (typeof decoded === 'string') {
						try {
							const caps = JSON.parse(decoded) as Capabilities;
							this.capabilities[deviceId] = caps;
							if (browser) {
								_saveCapsToCache(deviceId, caps);
							}
						} catch (e) {
							console.error(`Failed to parse refreshed capabilities for ${deviceId}`, e);
						}
					}
				}
			}
		} catch (e) {
			console.error(`Failed to refresh capabilities for ${deviceId}`, e);
		}
	}
}

// ── localStorage Cache Helpers ──────────────────────────────────────────────

function _cacheKey(deviceId: string, version: string): string {
	return `${SCHEMA_CACHE_PREFIX}${deviceId}_${version}`;
}

function _capsKey(deviceId: string): string {
	return `${SCHEMA_CACHE_PREFIX}caps_${deviceId}`;
}

function _loadFromCache(deviceId: string, version: string): CacheEntry | null {
	try {
		const raw = localStorage.getItem(_cacheKey(deviceId, version));
		if (!raw) return null;

		const entry = JSON.parse(raw) as CacheEntry;

		// Check TTL
		if (Date.now() - entry.timestamp > CACHE_MAX_AGE_MS) {
			localStorage.removeItem(_cacheKey(deviceId, version));
			return null;
		}

		// Check version match
		if (entry.version !== version) return null;

		return entry;
	} catch {
		return null;
	}
}

function _saveToCache(deviceId: string, version: string, schema: SettingsSchema): void {
	try {
		const entry: CacheEntry = { schema, version, timestamp: Date.now() };
		localStorage.setItem(_cacheKey(deviceId, version), JSON.stringify(entry));
		_evictOldEntries();
	} catch (e) {
		console.warn('Failed to cache schema', e);
	}
}

function _loadCapsFromCache(deviceId: string): Capabilities | null {
	try {
		const raw = localStorage.getItem(_capsKey(deviceId));
		if (!raw) return null;
		return JSON.parse(raw) as Capabilities;
	} catch {
		return null;
	}
}

function _saveCapsToCache(deviceId: string, caps: Capabilities): void {
	try {
		localStorage.setItem(_capsKey(deviceId), JSON.stringify(caps));
	} catch (e) {
		console.warn('Failed to cache capabilities', e);
	}
}

function _evictDeviceCache(deviceId: string): void {
	const prefix = `${SCHEMA_CACHE_PREFIX}${deviceId}`;
	for (let i = localStorage.length - 1; i >= 0; i--) {
		const key = localStorage.key(i);
		if (key?.startsWith(prefix)) {
			localStorage.removeItem(key);
		}
	}
	localStorage.removeItem(_capsKey(deviceId));
}

function _evictOldEntries(): void {
	const entries: { key: string; timestamp: number }[] = [];

	for (let i = 0; i < localStorage.length; i++) {
		const key = localStorage.key(i);
		if (!key?.startsWith(SCHEMA_CACHE_PREFIX) || key.includes('_caps_')) continue;

		try {
			const raw = localStorage.getItem(key);
			if (raw) {
				const parsed = JSON.parse(raw);
				entries.push({ key, timestamp: parsed.timestamp || 0 });
			}
		} catch {
			// Remove corrupt entries
			if (key) localStorage.removeItem(key);
		}
	}

	// Evict oldest if over limit
	if (entries.length > CACHE_MAX_ENTRIES) {
		entries.sort((a, b) => a.timestamp - b.timestamp);
		const toEvict = entries.slice(0, entries.length - CACHE_MAX_ENTRIES);
		for (const entry of toEvict) {
			localStorage.removeItem(entry.key);
		}
	}
}

export const schemaState = new SchemaStore();
