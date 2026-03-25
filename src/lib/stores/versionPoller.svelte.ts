/**
 * Smart polling for ParamsVersion — detects device-side param changes.
 *
 * Polls a lightweight ParamsVersion counter from the device at adaptive intervals.
 * When version mismatch is detected, triggers a callback to re-fetch changed values.
 */

import { fetchSettingsAsync } from '$lib/api/device';
import { logtoClient } from '$lib/logto/auth.svelte';
import { decodeParamValue } from '$lib/utils/device';

const ACTIVE_INTERVAL_MS = 5_000;
const BACKGROUND_INTERVAL_MS = 30_000;

export interface VersionPollerOptions {
	deviceId: string;
	onVersionChange: (newVersion: number) => void;
}

class VersionPoller {
	private intervalId: ReturnType<typeof setInterval> | undefined;
	private deviceId: string | null = null;
	private lastVersion: number | null = null;
	private onVersionChange: ((v: number) => void) | null = null;
	private isActive = true;

	constructor() {
		if (typeof document !== 'undefined') {
			document.addEventListener('visibilitychange', () => {
				this.isActive = document.visibilityState === 'visible';
				this.restart();
			});
		}
	}

	/** Start polling for a specific device. Stops any previous poll. */
	start(opts: VersionPollerOptions): void {
		this.stop();
		this.deviceId = opts.deviceId;
		this.onVersionChange = opts.onVersionChange;
		this.lastVersion = null;
		this.scheduleNext();
	}

	/** Stop polling entirely. */
	stop(): void {
		if (this.intervalId !== undefined) {
			clearInterval(this.intervalId);
			this.intervalId = undefined;
		}
		this.deviceId = null;
		this.onVersionChange = null;
	}

	/** Restart with current interval (called on visibility change). */
	private restart(): void {
		if (!this.deviceId || !this.onVersionChange) return;
		if (this.intervalId !== undefined) clearInterval(this.intervalId);
		this.scheduleNext();
	}

	private scheduleNext(): void {
		const interval = this.isActive ? ACTIVE_INTERVAL_MS : BACKGROUND_INTERVAL_MS;
		this.intervalId = setInterval(() => this.poll(), interval);
	}

	private async poll(): Promise<void> {
		if (!this.deviceId) return;
		const token = await logtoClient?.getIdToken();
		if (!token) return;

		try {
			const res = await fetchSettingsAsync(this.deviceId, ['ParamsVersion'], token, {
				maxPollTimeMs: 8_000,
				initialPollDelayMs: 200,
				maxPollDelayMs: 500
			});
			if (res.error || !res.items) return;

			const item = res.items.find((i) => i.key === 'ParamsVersion');
			if (!item) return;

			const version = Number(decodeParamValue(item)) || 0;

			if (this.lastVersion !== null && version !== this.lastVersion) {
				this.onVersionChange?.(version);
			}
			this.lastVersion = version;
		} catch {
			// Silently ignore poll failures — next poll will retry
		}
	}
}

export const versionPoller = new VersionPoller();
