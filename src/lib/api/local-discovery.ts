/**
 * Manual local-device registry for sunnylink.
 *
 * Users enter a device's LAN IP on the device details page.  The IP is probed
 * once to verify it really hosts that device, then cached in localStorage
 * so subsequent visits reconnect instantly.  No automatic discovery.
 */
import { browser } from '$app/environment';

const LOCAL_PORT = 8456;
const PING_TIMEOUT_MS = 200;

/** How long a cached IP stays trusted before we re-probe (1 hour). */
const CACHE_MAX_AGE_MS = 60 * 60 * 1000;

const MANUAL_IP_CACHE_KEY = 'sunnylink_local_ips';

interface DiscoveredDevice {
	baseUrl: string;  // e.g. "http://192.168.1.5:8456"
	dongleId: string;
	lastSeen: number;
}

interface PingResponse {
	dongle_id: string;
}

/** In-memory cache — valid for the tab's lifetime. */
const discoveredDevices = new Map<string, DiscoveredDevice>();

/* ------------------------------------------------------------------ */
/*  Raw XHR (bypasses extension TLS-forcing on plain-HTTP local URLs)  */
/* ------------------------------------------------------------------ */

function _xhrGet(url: string, timeoutMs: number): Promise<Response> {
	return new Promise((resolve, reject) => {
		const xhr = new XMLHttpRequest();
		xhr.open('GET', url, true);
		xhr.timeout = timeoutMs;
		xhr.responseType = 'arraybuffer';
		xhr.onload = () => {
			const body = xhr.response instanceof ArrayBuffer ? xhr.response : null;
			const headers = new Headers();
			const hdr = xhr.getAllResponseHeaders();
			for (const line of hdr.trim().split(/\r?\n/)) {
				const i = line.indexOf(':');
				if (i > 0) headers.set(line.slice(0, i).trim(), line.slice(i + 1).trim());
			}
			resolve(new Response(body, { status: xhr.status, statusText: xhr.statusText, headers }));
		};
		xhr.onerror = () => reject(new Error('XHR error'));
		xhr.ontimeout = () => reject(new Error('XHR timeout'));
		xhr.onabort = () => reject(new DOMException('Aborted', 'AbortError'));
		xhr.send();
	});
}

/* ------------------------------------------------------------------ */
/*  localStorage helpers                                               */
/* ------------------------------------------------------------------ */

function loadManualIps(): Record<string, string> {
	if (!browser) return {};
	try {
		const raw = localStorage.getItem(MANUAL_IP_CACHE_KEY);
		return raw ? JSON.parse(raw) : {};
	} catch {
		return {};
	}
}

function saveManualIp(deviceId: string, ip: string): void {
	if (!browser) return;
	try {
		const ips = loadManualIps();
		ips[deviceId] = ip;
		localStorage.setItem(MANUAL_IP_CACHE_KEY, JSON.stringify(ips));
	} catch { /* non-critical */ }
}

function removeManualIp(deviceId: string): void {
	if (!browser) return;
	try {
		const ips = loadManualIps();
		delete ips[deviceId];
		localStorage.setItem(MANUAL_IP_CACHE_KEY, JSON.stringify(ips));
	} catch { /* non-critical */ }
}

/* ------------------------------------------------------------------ */
/*  Public API                                                         */
/* ------------------------------------------------------------------ */

/** Manually register a device's local IP.  Probes once to verify the
 *  device is really there, then caches so subsequent visits reconnect
 *  without re-entry. */
export async function registerManualIp(
	deviceId: string,
	ip: string
): Promise<boolean> {
	const url = `http://${ip}:${LOCAL_PORT}/ping`;
	try {
		const resp = await _xhrGet(url, PING_TIMEOUT_MS);
		if (!resp.ok) return false;
		const data = (await resp.json()) as PingResponse;
		if (data?.dongle_id !== deviceId) return false;

		const device: DiscoveredDevice = {
			baseUrl: `http://${ip}:${LOCAL_PORT}`,
			dongleId: deviceId,
			lastSeen: Date.now(),
		};
		discoveredDevices.set(deviceId, device);
		saveManualIp(deviceId, ip);
		return true;
	} catch {
		return false;
	}
}

/** Forget a device's local connection. */
export function forgetLocalDevice(deviceId: string): void {
	discoveredDevices.delete(deviceId);
	removeManualIp(deviceId);
}

/** Get the manual IP for a device, if one was entered. */
export function getManualIp(deviceId: string): string | null {
	return loadManualIps()[deviceId] ?? null;
}

/**
 * Check synchronously whether a device is known to be local (from cache).
 * Does NOT trigger a network probe.
 */
export function isDeviceLocalSync(deviceId: string): boolean {
	const existing = discoveredDevices.get(deviceId);
	if (!existing) return false;
	return Date.now() - existing.lastSeen < CACHE_MAX_AGE_MS;
}

/**
 * Check whether a device is on the local network.  If we have a recent
 * cache hit it returns true instantly; otherwise it re-probes the
 * stored manual IP.
 */
export async function isDeviceLocal(deviceId: string): Promise<boolean> {
	const existing = discoveredDevices.get(deviceId);
	if (existing && Date.now() - existing.lastSeen < CACHE_MAX_AGE_MS) {
		return true;
	}

	// Re-probe the manual IP, if one is stored.
	const ip = getManualIp(deviceId);
	if (!ip) return false;

	const ok = await registerManualIp(deviceId, ip);
	if (!ok) {
		// IP is stale — remove it so the user sees the text field again.
		forgetLocalDevice(deviceId);
	}
	return ok;
}

/**
 * Get the local base URL for a device (e.g. "http://192.168.1.5:8456").
 * Returns null if the device isn't locally available.
 */
export function getLocalBaseUrl(deviceId: string): string | null {
	const device = discoveredDevices.get(deviceId);
	if (!device || Date.now() - device.lastSeen >= CACHE_MAX_AGE_MS) return null;
	return device.baseUrl;
}

/**
 * Restore cached local devices on page load.  Re-probes each saved IP
 * to verify the device is still reachable.
 */
export async function restoreCachedDevices(): Promise<void> {
	const ips = loadManualIps();
	const probes = Object.entries(ips).map(async ([deviceId, ip]) => {
		const ok = await registerManualIp(deviceId, ip);
		if (!ok) forgetLocalDevice(deviceId);
		return ok;
	});
	await Promise.allSettled(probes);
}

/* ------------------------------------------------------------------ */
/*  URL rewriting                                                      */
/* ------------------------------------------------------------------ */

/**
 * Rewrite a cloud Athena URL to its local equivalent.
 *
 * Mapping:
 *   /v1/settings/{deviceId}              → /api/v1/settings
 *   /v1/settings/{deviceId}/values       → /api/v1/settings/values
 *   /v1/settings/{deviceId}/paramsMetadata → /api/v1/settings/metadata
 *   /v1/settings/{deviceId}/async/values → /api/v1/settings/values
 *   /v1/settings/{deviceId}/async/poll/{id} → /api/v1/settings/values
 *   /ws/{deviceId}/message               → /api/v1/message
 *   /settings/{deviceId} (POST)          → /api/v0/settings
 */
export function rewriteToLocal(url: string, deviceId: string): string | null {
	const baseUrl = getLocalBaseUrl(deviceId);
	if (!baseUrl) return null;

	let path: string;
	try {
		path = new URL(url).pathname + new URL(url).search;
	} catch {
		path = url;
	}

	// Settings v1 sub-paths
	const v1Match = path.match(/^\/v1\/settings\/[^/]+\/(.+)$/);
	if (v1Match?.[1]) {
		const sub = v1Match[1];
		if (sub === 'paramsMetadata') return `${baseUrl}/api/v1/settings/metadata`;
		if (sub.startsWith('async/values')) {
			const qs = path.includes('?') ? path.slice(path.indexOf('?')) : '';
			return `${baseUrl}/api/v1/settings/values${qs}`;
		}
		if (sub.startsWith('async/poll/')) return `${baseUrl}/api/v1/settings/values`;
		if (sub.startsWith('values')) {
			const qs = path.includes('?') ? path.slice(path.indexOf('?')) : '';
			return `${baseUrl}/api/v1/settings/values${qs}`;
		}
		return `${baseUrl}/api/v1/settings/values?paramKeys=${encodeURIComponent(sub)}`;
	}

	// Settings v1 root
	if (/^\/v1\/settings\/[^/]+\/?$/.test(path)) return `${baseUrl}/api/v1/settings`;

	// WebSocket message proxy
	const wsMatch = path.match(/^\/(?:v1\/)?ws\/[^/]+\/message/);
	if (wsMatch) {
		const qs = path.includes('?') ? path.slice(path.indexOf('?')) : '';
		return `${baseUrl}/api/v1/message${qs}`;
	}

	// Settings v0 POST
	if (/^\/settings\/[^/]+\/?$/.test(path)) return `${baseUrl}/api/v0/settings`;

	return null;
}
