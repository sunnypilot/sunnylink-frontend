import { untrack } from 'svelte';

export type SyncStatus = 'idle' | 'revalidating' | 'synced' | 'failed';

const DEFAULT_HOLD_MS = 3000;
const SETTLE_DEBOUNCE_MS = 250;

/**
 * Reactive sync status state machine.
 * Flow: idle → revalidating → synced|failed (hold) → idle
 *
 * Settle debounce: when revalidating flips false, wait SETTLE_DEBOUNCE_MS
 * before committing to synced/failed. Prevents flicker when concurrent
 * loading flags clear in different microtasks.
 */
export function createSyncStatus(
	isRevalidating: () => boolean,
	isSucceeded: () => boolean,
	holdMs = DEFAULT_HOLD_MS
) {
	let status: SyncStatus = $state('idle');
	let holdTimerId: ReturnType<typeof setTimeout> | undefined = undefined;
	let settleTimerId: ReturnType<typeof setTimeout> | undefined = undefined;

	function clearHoldTimer() {
		if (holdTimerId !== undefined) {
			clearTimeout(holdTimerId);
			holdTimerId = undefined;
		}
	}

	function clearSettleTimer() {
		if (settleTimerId !== undefined) {
			clearTimeout(settleTimerId);
			settleTimerId = undefined;
		}
	}

	function reset() {
		clearHoldTimer();
		clearSettleTimer();
		status = 'idle';
	}

	$effect(() => {
		const revalidating = isRevalidating();

		untrack(() => {
			if (revalidating) {
				clearSettleTimer();
				clearHoldTimer();
				if (status !== 'revalidating') status = 'revalidating';
				return;
			}
			if (status !== 'revalidating') return;
			if (settleTimerId !== undefined) return;
			settleTimerId = setTimeout(() => {
				settleTimerId = undefined;
				if (isRevalidating()) return;
				status = isSucceeded() ? 'synced' : 'failed';
				holdTimerId = setTimeout(() => {
					status = 'idle';
					holdTimerId = undefined;
				}, holdMs);
			}, SETTLE_DEBOUNCE_MS);
		});
	});

	return {
		get status() {
			return status;
		},
		reset
	};
}
