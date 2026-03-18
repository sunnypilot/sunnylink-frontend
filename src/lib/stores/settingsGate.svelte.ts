/**
 * Shared reactive state for the settings device-offline gate.
 *
 * The settings +layout.svelte drives this state when the selected device
 * is offline. The root +layout.svelte reads it to render a blocking overlay
 * OUTSIDE the DaisyUI drawer, where `fixed` positioning works correctly.
 *
 * "No Device Selected" is handled inline by each settings page (not blocking).
 */

class SettingsGateState {
  active = $state(false);
  deviceName = $state('');
  deviceId = $state('');
  retrying = $state(false);
  devices = $state<any[]>([]);
  onRetry: (() => void) | null = null;
}

export const settingsGate = new SettingsGateState();
