import { checkDeviceStatus } from '$lib/api/device';
import { deviceState } from '$lib/stores/device.svelte';
import { logtoClient } from '$lib/logto/auth.svelte';
import { preferences } from '$lib/stores/preferences.svelte';

const POLL_INTERVAL_MS = 60_000; // 60s base interval
const IDLE_SLOW_MS = 120_000; // 2min after 5min idle
const IDLE_STOP_MS = 300_000; // 5min after 15min idle
const BACKOFF_MAX_MS = 300_000; // 5min max backoff
const STALE_WARN_MS = 240_000; // 4min → amber
const STALE_CRITICAL_MS = 600_000; // 10min → dimmed

// Idle detection: reduce polling when user isn't interacting
const IDLE_SLOW_THRESHOLD_MS = 300_000; // 5min → slow down
const IDLE_STOP_THRESHOLD_MS = 900_000; // 15min → stop polling

let lastCheckedAt = $state<number>(0);
let isRefreshing = $state(false);
let consecutiveFailures = $state(0);
let intervalId: ReturnType<typeof setInterval> | null = null;
let tickId: ReturnType<typeof setInterval> | null = null;
let tickCounter = $state(0);
let lastActivityAt = Date.now();
let activityListenersAdded = false;

function resetActivity() {
	lastActivityAt = Date.now();
}

function addActivityListeners() {
	if (activityListenersAdded || typeof document === 'undefined') return;
	const events = ['mousedown', 'keydown', 'touchstart', 'scroll'] as const;
	for (const e of events) document.addEventListener(e, resetActivity, { passive: true });
	activityListenersAdded = true;
}

function removeActivityListeners() {
	if (!activityListenersAdded || typeof document === 'undefined') return;
	const events = ['mousedown', 'keydown', 'touchstart', 'scroll'] as const;
	for (const e of events) document.removeEventListener(e, resetActivity);
	activityListenersAdded = false;
}

function getEffectiveInterval(): number {
	if (!preferences.autoRefresh) return 0; // 0 = don't poll

	const idleMs = Date.now() - lastActivityAt;

	// Adaptive: slow down when user is idle
	if (idleMs > IDLE_STOP_THRESHOLD_MS) return IDLE_STOP_MS;
	if (idleMs > IDLE_SLOW_THRESHOLD_MS) return IDLE_SLOW_MS;

	// Backoff on failures
	if (consecutiveFailures > 0) {
		const backoff = POLL_INTERVAL_MS * Math.pow(2, consecutiveFailures);
		return Math.min(backoff, BACKOFF_MAX_MS);
	}

	return POLL_INTERVAL_MS;
}

async function pollAllDevices(force: boolean = false, silent: boolean = false) {
	if (isRefreshing) return;
	if (!logtoClient) return;

	const token = await logtoClient.getIdToken();
	if (!token) return;

	const allDeviceIds = Object.keys(deviceState.onlineStatuses);
	if (allDeviceIds.length === 0) return;

	// Only poll devices that are online, loading, or recently had errors.
	// Skip confirmed-offline devices — they'll be re-checked on manual refresh
	// or when the user navigates to their settings.
	const deviceIds = allDeviceIds.filter((id) => {
		const status = deviceState.onlineStatuses[id];
		return status !== 'offline';
	});

	isRefreshing = true;

	try {
		// allSettled so one device's 5xx / timeout doesn't mask the others —
		// the previous Promise.all rejected on first failure and bumped
		// consecutiveFailures even when other devices succeeded.
		const results = await Promise.allSettled(
			deviceIds.map((deviceId) => checkDeviceStatus(deviceId, token, force, silent))
		);
		const failed = results.filter((r) => r.status === 'rejected').length;
		lastCheckedAt = Date.now();
		if (failed === 0) {
			consecutiveFailures = 0;
		} else if (failed >= Math.ceil(results.length / 2)) {
			// Majority failed — likely backend outage, back off.
			consecutiveFailures++;
			console.error(`Status poll: ${failed}/${results.length} devices failed`);
		}
	} finally {
		isRefreshing = false;
	}

	reschedule();
}

function reschedule() {
	stopInterval();
	const interval = getEffectiveInterval();
	if (interval > 0) {
		intervalId = setInterval(() => pollAllDevices(true, true), interval);
	}
}

function stopInterval() {
	if (intervalId) {
		clearInterval(intervalId);
		intervalId = null;
	}
}

function startTick() {
	stopTick();
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
		resetActivity(); // Tab return = user activity
		if (preferences.autoRefresh) {
			const staleMs = Date.now() - lastCheckedAt;
			if (staleMs > POLL_INTERVAL_MS) {
				pollAllDevices(true, true);
			}
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

	start() {
		if (typeof document === 'undefined') return;
		document.addEventListener('visibilitychange', handleVisibilityChange);
		addActivityListeners();
		startTick();
		reschedule();
	},

	stop() {
		if (typeof document === 'undefined') return;
		document.removeEventListener('visibilitychange', handleVisibilityChange);
		removeActivityListeners();
		stopInterval();
		stopTick();
	},

	async refreshNow() {
		await pollAllDevices(true);
	},

	markChecked() {
		lastCheckedAt = Date.now();
	},

	confirmReachable(deviceId: string) {
		if (deviceState.onlineStatuses[deviceId] !== 'online') {
			deviceState.onlineStatuses[deviceId] = 'online';
		}
		lastCheckedAt = Date.now();
		consecutiveFailures = 0;
		reschedule();
	}
};
