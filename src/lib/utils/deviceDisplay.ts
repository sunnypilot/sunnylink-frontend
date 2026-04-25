// Display-name resolution for a paired device. Alias is always optional —
// fall back through server alias, telemetry device-type label, then the raw
// device ID so we never show an empty string.
//
// Order of precedence:
//   1. Local alias (user-set, cached in deviceState.aliases)
//   2. Server alias (from the paired-devices list)
//   3. Device-type label ("comma 3X", "comma three", "comma four", "PC")
//   4. Raw device_id — stable fallback while telemetry is still arriving

import { deviceState } from '$lib/stores/device.svelte';

export const DEVICE_TYPE_NAMES: Record<string, string> = {
	tizi: 'comma 3X',
	mici: 'comma four',
	tici: 'comma three',
	pc: 'PC'
};

export function getDeviceTypeLabel(deviceType: string | null | undefined): string | null {
	if (!deviceType || deviceType === 'unknown') return null;
	return DEVICE_TYPE_NAMES[deviceType.toLowerCase()] ?? null;
}

export function getDeviceDisplayName(
	deviceId: string | null | undefined,
	serverAlias?: string | null
): string {
	if (!deviceId) return '';
	const local = deviceState.aliases[deviceId];
	if (local && local.trim()) return local;
	if (serverAlias && serverAlias.trim()) return serverAlias;
	const typeLabel = getDeviceTypeLabel(deviceState.deviceTelemetry[deviceId]?.deviceType);
	if (typeLabel) return typeLabel;
	return deviceId;
}
