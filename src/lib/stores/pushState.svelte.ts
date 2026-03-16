/** Tracks which param keys are currently being pushed per device */
class PushStateStore {
  pushingKeys: Record<string, Set<string>> = $state({});

  startPush(deviceId: string, key: string) {
    if (!this.pushingKeys[deviceId]) {
      this.pushingKeys[deviceId] = new Set();
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
