// Shared badge derivations for device connectivity + driving state.
// Hero + details page both render the same chips from the same store data;
// derivation lives here so the two surfaces can't drift.

import { deviceState } from '$lib/stores/device.svelte';

export type BadgeTone = 'green' | 'red' | 'amber' | 'cyan' | 'gray';
export type Badge = { label: string; tone: BadgeTone };

// WCAG AA (4.5:1) on the tinted background in both light and dark modes.
// Ring adds a subtle edge for the low-luminance tints so the chip outline
// reads against elevated surface cards.
export const TONE_CLASSES: Record<BadgeTone, string> = {
	green:
		'bg-emerald-500/10 text-emerald-700 ring-1 ring-inset ring-emerald-500/30 dark:text-emerald-400',
	red: 'bg-red-500/10 text-red-700 ring-1 ring-inset ring-red-500/30 dark:text-red-400',
	amber: 'bg-amber-500/10 text-amber-700 ring-1 ring-inset ring-amber-500/30 dark:text-amber-400',
	cyan: 'bg-cyan-500/10 text-cyan-700 ring-1 ring-inset ring-cyan-500/30 dark:text-cyan-400',
	gray: 'bg-[var(--sl-bg-elevated)] text-[var(--sl-text-2)] ring-1 ring-inset ring-[var(--sl-border)]'
};

export function getConnectivityBadge(deviceId: string | null | undefined): Badge {
	if (!deviceId) return { label: 'Checking…', tone: 'gray' };
	const status = deviceState.onlineStatuses[deviceId];
	if (!status || status === 'loading') return { label: 'Checking…', tone: 'gray' };
	if (status === 'error') return { label: 'Error', tone: 'red' };
	if (status === 'offline') return { label: 'Offline', tone: 'red' };
	return { label: 'Online', tone: 'green' };
}

export function getDrivingBadge(deviceId: string | null | undefined): Badge | null {
	if (!deviceId) return null;
	const status = deviceState.onlineStatuses[deviceId];
	if (status !== 'online') return null;
	const offroad = deviceState.offroadStatuses[deviceId];
	if (offroad?.forceOffroad) return { label: 'Always Offroad', tone: 'amber' };
	if (offroad?.isOffroad === false) return { label: 'Onroad', tone: 'cyan' };
	if (offroad?.isOffroad === true) return { label: 'Offroad', tone: 'gray' };
	return null;
}
