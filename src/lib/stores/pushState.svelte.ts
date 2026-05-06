import { SvelteSet } from 'svelte/reactivity';

/** Tracks which param keys are currently being pushed per device.
 *  Uses SvelteSet (not Set) because plain Set mutations inside a $state
 *  record don't trigger reactivity — the Pending pill gets stuck otherwise. */
class PushStateStore {
	pushingKeys: Record<string, SvelteSet<string>> = $state({});

	startPush(deviceId: string, key: string) {
		if (!this.pushingKeys[deviceId]) {
			this.pushingKeys[deviceId] = new SvelteSet();
		}
		this.pushingKeys[deviceId].add(key);
	}

	endPush(deviceId: string, key: string) {
		this.pushingKeys[deviceId]?.delete(key);
	}

	isPushing(deviceId: string, key: string): boolean {
		return this.pushingKeys[deviceId]?.has(key) ?? false;
	}

	/** Check if any key in the given set is currently being pushed */
	isAnyPushing(deviceId: string, keys: string[]): boolean {
		const pushing = this.pushingKeys[deviceId];
		if (!pushing || pushing.size === 0) return false;
		return keys.some((k) => pushing.has(k));
	}
}

export const pushStateStore = new PushStateStore();
