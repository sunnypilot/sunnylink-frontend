import { checkDeviceStatus } from '$lib/api/device';
import { deviceState } from '$lib/stores/device.svelte';
import { logtoClient } from '$lib/logto/auth.svelte';

const POLL_INTERVAL_MS = 60_000; // 60s for device status
const BACKOFF_MAX_MS = 300_000; // 5min max backoff
const STALE_WARN_MS = 240_000; // 4min → amber
const STALE_CRITICAL_MS = 600_000; // 10min → dimmed

let lastCheckedAt = $state<number>(0);
let isRefreshing = $state(false);
let consecutiveFailures = $state(0);
let intervalId: ReturnType<typeof setInterval> | null = null;
let tickId: ReturnType<typeof setInterval> | null = null;
let tickCounter = $state(0); // triggers reactivity for relative time

function getBackoffInterval(): number {
	if (consecutiveFailures === 0) return POLL_INTERVAL_MS;
	const backoff = POLL_INTERVAL_MS * Math.pow(2, consecutiveFailures);
	return Math.min(backoff, BACKOFF_MAX_MS);
}

async function pollAllDevices(force: boolean = false, silent: boolean = false) {
	if (isRefreshing) return;
	if (!logtoClient) return;

	const token = await logtoClient.getIdToken();
	if (!token) return;

	// Get all known device IDs from the store
	const deviceIds = Object.keys(deviceState.onlineStatuses);
	if (deviceIds.length === 0) return;

	isRefreshing = true;

	try {
		await Promise.all(
			deviceIds.map((deviceId) => checkDeviceStatus(deviceId, token, force, silent))
		);
		lastCheckedAt = Date.now();
		consecutiveFailures = 0;
	} catch (e) {
		console.error('Status poll failed:', e);
		consecutiveFailures++;
	} finally {
		isRefreshing = false;
	}

	// Reschedule with backoff if needed
	reschedule();
}

function reschedule() {
	stopInterval();
	const interval = getBackoffInterval();
	intervalId = setInterval(() => pollAllDevices(true, true), interval);
}

function stopInterval() {
	if (intervalId) {
		clearInterval(intervalId);
		intervalId = null;
	}
}

function startTick() {
	stopTick();
	// Update tick counter every 10s to trigger reactive timestamp updates
	tickId = setInterval(() => {
		tickCounter++;
	}, 10_000);
}

function stopTick() {
	if (tickId) {
		clearInterval(tickId);
		tickId = null;
	}
}

function handleVisibilityChange() {
	if (document.hidden) {
		stopInterval();
		stopTick();
	} else {
		// Immediate refresh on tab return if stale
		const staleMs = Date.now() - lastCheckedAt;
		if (staleMs > POLL_INTERVAL_MS) {
			pollAllDevices(true, true);
		}
		startTick();
		reschedule();
	}
}

export const statusPolling = {
	get lastCheckedAt() {
		return lastCheckedAt;
	},
	get isRefreshing() {
		return isRefreshing;
	},
	get tickCounter() {
		return tickCounter;
	},

	get staleness(): 'fresh' | 'warn' | 'critical' {
		if (lastCheckedAt === 0) return 'fresh';
		const age = Date.now() - lastCheckedAt;
		if (age > STALE_CRITICAL_MS) return 'critical';
		if (age > STALE_WARN_MS) return 'warn';
		return 'fresh';
	},

	/** Start polling. Call once when app initializes with devices. */
	start() {
		if (typeof document === 'undefined') return;
		document.addEventListener('visibilitychange', handleVisibilityChange);
		startTick();
		reschedule();
	},

	/** Stop all polling. Call on cleanup. */
	stop() {
		if (typeof document === 'undefined') return;
		document.removeEventListener('visibilitychange', handleVisibilityChange);
		stopInterval();
		stopTick();
	},

	/** Manual refresh — force-checks all devices immediately. */
	async refreshNow() {
		await pollAllDevices(true);
	},

	/** Mark that an initial check has been done (from layout load). */
	markChecked() {
		lastCheckedAt = Date.now();
	}
};
