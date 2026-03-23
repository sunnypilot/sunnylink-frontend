import { untrack } from 'svelte';

export type SyncStatus = 'idle' | 'revalidating' | 'synced' | 'failed';

const DEFAULT_HOLD_MS = 3000;

/**
 * Creates a reactive sync status state machine.
 *
 * State flow: idle → revalidating → synced|failed (hold) → idle
 *
 * @param isRevalidating — reactive getter: true while any background work is in-flight
 * @param isSucceeded — reactive getter: true when the most recent work completed without error
 * @param holdMs — how long to show synced/failed before returning to idle (default 3000)
 */
export function createSyncStatus(
	isRevalidating: () => boolean,
	isSucceeded: () => boolean,
	holdMs = DEFAULT_HOLD_MS
) {
	let status: SyncStatus = $state('idle');
	let timerId: ReturnType<typeof setTimeout> | undefined = undefined;

	function clearTimer() {
		if (timerId !== undefined) {
			clearTimeout(timerId);
			timerId = undefined;
		}
	}

	function reset() {
		clearTimer();
		status = 'idle';
	}

	$effect(() => {
		const revalidating = isRevalidating();
		const succeeded = isSucceeded();

		untrack(() => {
			if (revalidating && status !== 'revalidating') {
				clearTimer();
				status = 'revalidating';
			} else if (!revalidating && status === 'revalidating') {
				status = succeeded ? 'synced' : 'failed';
				timerId = setTimeout(() => {
					status = 'idle';
					timerId = undefined;
				}, holdMs);
			}
		});
	});

	return {
		get status() {
			return status;
		},
		reset
	};
}
