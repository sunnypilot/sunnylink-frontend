/**
 * Pure functions for detecting drift between cached and fresh device values.
 *
 * Drift = a setting that was changed on the device (via on-device UI)
 * since the web UI last fetched it. This is the Terraform-style
 * "planned state vs actual state" comparison.
 */

import type { PendingChange } from '$lib/stores/pendingChanges.svelte';

export interface DriftEntry {
  key: string;
  cachedValue: unknown;
  freshValue: unknown;
}

/**
 * Normalize a value for comparison.
 * Handles string/number/boolean coercion that can occur between
 * device params (always strings) and decoded frontend values.
 */
function normalize(value: unknown): string {
  if (value === undefined || value === null) return '';
  if (typeof value === 'boolean') return value ? '1' : '0';
  return String(value);
}

/**
 * Detect all keys where cached and fresh values differ.
 */
export function detectDrift(
  cached: Record<string, unknown>,
  fresh: Record<string, unknown>
): DriftEntry[] {
  const drifts: DriftEntry[] = [];

  for (const key of Object.keys(fresh)) {
    if (!(key in cached)) continue; // new key — not drift, just previously unknown
    if (normalize(cached[key]) !== normalize(fresh[key])) {
      drifts.push({ key, cachedValue: cached[key], freshValue: fresh[key] });
    }
  }

  return drifts;
}

/**
 * Filter out drifts that match a pending change's desired value.
 *
 * If the user queued "MADS = OFF" and the device now shows "MADS = OFF",
 * that's not a conflict — it's an expected result (maybe applied on-device).
 */
export function filterMeaningfulDrift(
  drifts: DriftEntry[],
  pending: PendingChange[]
): DriftEntry[] {
  const pendingMap = new Map(pending.map((p) => [p.key, p]));

  return drifts.filter((d) => {
    const p = pendingMap.get(d.key);
    if (!p) return true; // no pending change for this key — genuine drift

    // If device value matches what the user queued, it's expected
    if (normalize(d.freshValue) === normalize(p.desiredValue)) return false;

    return true; // device value differs from both cached AND desired — conflict
  });
}

/**
 * Detect conflicts: keys where a pending change exists AND the device
 * changed the same key to a DIFFERENT value than what the user queued.
 */
export function detectConflicts(
  drifts: DriftEntry[],
  pending: PendingChange[]
): DriftEntry[] {
  const pendingMap = new Map(pending.map((p) => [p.key, p]));

  return drifts.filter((d) => {
    const p = pendingMap.get(d.key);
    if (!p) return false; // no pending change — drift, not conflict
    // Device changed to something different than what user queued
    return normalize(d.freshValue) !== normalize(p.desiredValue);
  });
}
