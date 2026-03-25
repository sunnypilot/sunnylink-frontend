/**
 * Schema Store
 *
 * Manages the settings schema + capabilities state per device.
 *
 * - Schema (including live capabilities) is fetched via getParamsMetadata RPC
 * - checkDeviceStatus() in device.ts calls fetchParamsMetadata() and stores the result here
 * - loadSchema() provides stale-while-revalidate with localStorage caching by GitCommit
 * - Capabilities are embedded in the schema response (schema.capabilities)
 */

import { browser } from '$app/environment';
import type { SettingsSchema, Capabilities } from '$lib/types/schema';
import { fetchParamsMetadata } from '$lib/api/device';

const SCHEMA_CACHE_PREFIX = 'sunnylink_schema_';
const CACHE_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000; // 7 days
const CACHE_MAX_ENTRIES = 10;

interface CacheEntry {
	schema: SettingsSchema;
	version: string;
	timestamp: number;
}

class SchemaStore {
	/** Parsed schema per device (includes capabilities) */
	schemas: Record<string, SettingsSchema> = $state({});

	/** Schema version (GitCommit) per device */
	versions: Record<string, string> = $state({});

	/** Loading state per device */
	loading: Record<string, boolean> = $state({});

	/** Background revalidation status: null=idle, 'revalidating'=in-flight, 'succeeded'|'failed'=done */
	revalidationStatus: Record<string, 'revalidating' | 'succeeded' | 'failed' | null> = $state({});

	/** Error state per device */
	errors: Record<string, string | null> = $state({});

	/** Whether schema was unavailable (device on older sunnypilot version) */
	schemaUnavailable: Record<string, boolean> = $state({});

	/**
	 * Capabilities per device — derived from schema.capabilities.
	 * Components read this; it stays in sync because schemas[] is the source of truth.
	 */
	get capabilities(): Record<string, Capabilities | null> {
		const result: Record<string, Capabilities | null> = {};
		for (const [deviceId, schema] of Object.entries(this.schemas)) {
			if (schema.capabilities) {
				// When no car is fingerprinted (brand empty), car-derived capabilities
				// are all defaults (false). Return null to trigger permissive evaluation
				// so settings aren't incorrectly gated before a car is connected.
				result[deviceId] = schema.capabilities.brand ? schema.capabilities : null;
			}
		}
		return result;
	}

	/**
	 * Load schema + capabilities for a device (stale-while-revalidate).
	 *
	 * 1. Check localStorage cache (keyed by deviceId + gitCommit) → serve instantly if hit
	 * 2. Always fetch fresh schema from device via getParamsMetadata RPC
	 * 3. Update store + cache only if schema actually changed
	 * 4. Capabilities are embedded in schema — no separate fetch needed
	 */
	async loadSchema(deviceId: string, token: string, currentGitCommit?: string): Promise<void> {
		// Stale-while-revalidate: serve cached schema instantly, always revalidate
		let hadCache = false;
		if (browser && currentGitCommit) {
			const cached = _loadFromCache(deviceId, currentGitCommit);
			if (cached) {
				this.schemas[deviceId] = cached.schema;
				this.versions[deviceId] = cached.version;
				this.schemaUnavailable[deviceId] = false;
				hadCache = true;
			}
		}

		// Always fetch from device (background revalidation if cache hit)
		if (hadCache) {
			this.revalidationStatus[deviceId] = 'revalidating';
		} else {
			this.loading[deviceId] = true;
		}
		this.errors[deviceId] = null;
		if (!hadCache) {
			this.schemaUnavailable[deviceId] = false;
		}

		try {
			const parsed = await fetchParamsMetadata(deviceId, token);

			if (parsed) {
				const fetchedVersion = currentGitCommit || '';

				// SWR: only update store + cache if schema structure actually changed.
				// Compare panels + vehicle_settings (not generated_at, which changes every boot).
				// This prevents a full UI re-render when the schema content is identical.
				const existingSchema = this.schemas[deviceId];
				const schemaChanged =
					!existingSchema ||
					JSON.stringify(existingSchema.panels) !== JSON.stringify(parsed.panels) ||
					JSON.stringify(existingSchema.vehicle_settings) !==
						JSON.stringify(parsed.vehicle_settings);

				if (schemaChanged) {
					this.schemas[deviceId] = parsed;
					this.versions[deviceId] = fetchedVersion;

					if (browser && fetchedVersion) {
						_saveToCache(deviceId, fetchedVersion, parsed);
					}
				} else if (parsed.capabilities) {
					// Schema structure unchanged but capabilities may have changed
					// (e.g., vehicle change, param clear, different CarParamsPersistent)
					this.schemas[deviceId] = {
						...existingSchema,
						capabilities: parsed.capabilities,
						capability_labels: parsed.capability_labels
					};
				}

				if (hadCache) this.revalidationStatus[deviceId] = 'succeeded';
			} else {
				if (hadCache) this.revalidationStatus[deviceId] = 'failed';
				if (!hadCache) this.schemaUnavailable[deviceId] = true;
			}
		} catch (e) {
			console.error(`Failed to load schema for ${deviceId}`, e);
			if (hadCache) {
				this.revalidationStatus[deviceId] = 'failed';
			} else {
				this.errors[deviceId] = 'Network error';
			}
		} finally {
			this.loading[deviceId] = false;
		}
	}

	/**
	 * Refresh capabilities by re-fetching the schema from the device.
	 * Since capabilities are bundled in the schema response, this
	 * re-fetches via getParamsMetadata and updates the schema in-place.
	 */
	async refreshCapabilities(deviceId: string, token: string): Promise<void> {
		try {
			const parsed = await fetchParamsMetadata(deviceId, token);
			if (parsed?.capabilities) {
				// Update capabilities in the existing schema without replacing the whole schema
				const existing = this.schemas[deviceId];
				if (existing) {
					this.schemas[deviceId] = { ...existing, capabilities: parsed.capabilities };
				} else {
					this.schemas[deviceId] = parsed;
				}
			}
		} catch (e) {
			console.error(`Failed to refresh capabilities for ${deviceId}`, e);
		}
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
		delete this.versions[deviceId];
		delete this.revalidationStatus[deviceId];
		delete this.schemaUnavailable[deviceId];
		if (browser) {
			_evictDeviceCache(deviceId);
		}
	}
}

function _cacheKey(deviceId: string, version: string): string {
	return `${SCHEMA_CACHE_PREFIX}${deviceId}_${version}`;
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

function _evictDeviceCache(deviceId: string): void {
	const prefix = `${SCHEMA_CACHE_PREFIX}${deviceId}`;
	for (let i = localStorage.length - 1; i >= 0; i--) {
		const key = localStorage.key(i);
		if (key?.startsWith(prefix)) {
			localStorage.removeItem(key);
		}
	}
}

function _evictOldEntries(): void {
	const entries: { key: string; timestamp: number }[] = [];

	for (let i = 0; i < localStorage.length; i++) {
		const key = localStorage.key(i);
		if (!key?.startsWith(SCHEMA_CACHE_PREFIX)) continue;

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
