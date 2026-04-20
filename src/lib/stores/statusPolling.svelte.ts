import { checkDeviceStatus } from '$lib/api/device';
import { deviceState } from '$lib/stores/device.svelte';
import { logtoClient } from '$lib/logto/auth.svelte';

const STALE_REFRESH_MS = 60_000;
const STALE_WARN_MS = 240_000;
const STALE_CRITICAL_MS = 600_000;
const TICK_MS = 30_000;

let lastCheckedAt = $state<number>(0);
let isRefreshing = $state(false);
let consecutiveFailures = $state(0);
let tickId: ReturnType<typeof setInterval> | null = null;
let tickCounter = $state(0);

async function pollAllDevices(force: boolean = false, silent: boolean = false) {
	if (isRefreshing) return;
	if (!logtoClient) return;

	const token = await logtoClient.getIdToken();
	if (!token) return;

	const allDeviceIds = Object.keys(deviceState.onlineStatuses);
	if (allDeviceIds.length === 0) return;

	const deviceIds = allDeviceIds.filter((id) => {
		const status = deviceState.onlineStatuses[id];
		return status !== 'offline';
	});

	isRefreshing = true;

	try {
		const results = await Promise.allSettled(
			deviceIds.map((deviceId) => checkDeviceStatus(deviceId, token, force, silent))
		);
		const failed = results.filter((r) => r.status === 'rejected').length;
		lastCheckedAt = Date.now();
		if (failed === 0) {
			consecutiveFailures = 0;
		} else if (failed >= Math.ceil(results.length / 2)) {
			consecutiveFailures++;
			console.error(`Status poll: ${failed}/${results.length} devices failed`);
		}
	} finally {
		isRefreshing = false;
	}
}

function startTick() {
	stopTick();
	tickId = setInterval(() => {
		tickCounter++;
	}, TICK_MS);
}

function stopTick() {
	if (tickId) {
		clearInterval(tickId);
		tickId = null;
	}
}

function handleVisibilityChange() {
	if (document.hidden) {
		stopTick();
	} else {
		startTick();
		const staleMs = Date.now() - lastCheckedAt;
		if (lastCheckedAt === 0 || staleMs > STALE_REFRESH_MS) {
			pollAllDevices(true, true);
		}
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
		startTick();
		pollAllDevices(true, true);
	},

	stop() {
		if (typeof document === 'undefined') return;
		document.removeEventListener('visibilitychange', handleVisibilityChange);
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
	}
};
