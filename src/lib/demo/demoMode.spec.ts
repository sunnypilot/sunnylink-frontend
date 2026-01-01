import { beforeEach, describe, expect, it } from 'vitest';
import { deviceState } from '$lib/stores/device.svelte';
import { demoContext } from './demoContext.svelte';
import {
	activateDemoMode,
	demoCheckDeviceStatus,
	demoSetDeviceParams,
	resetDemoMode
} from './demoMode.svelte';

describe('demo mode', () => {
	beforeEach(async () => {
		await resetDemoMode();
		demoContext.isActive = true;
	});

	it('creates four demo devices with demo mode enabled', async () => {
		const devices = await activateDemoMode(true);
		expect(devices).toHaveLength(4);
		expect(demoContext.isActive).toBe(true);
	});

	it('updates device status for demo devices', async () => {
		const [first] = await activateDemoMode(true);
		await demoCheckDeviceStatus(first.device_id);
		expect(deviceState.onlineStatuses[first.device_id]).toBeDefined();
	});

	it('applies force offroad changes in demo mode', async () => {
		const devices = await activateDemoMode(true);
		const onroadDevice = devices.find((d) => d.state === 'onroad');
		expect(onroadDevice).toBeDefined();
		if (!onroadDevice) return;

		await demoSetDeviceParams(onroadDevice.device_id, [{ key: 'OffroadMode', value: true }]);
		expect(deviceState.offroadStatuses[onroadDevice.device_id]?.forceOffroad).toBe(true);
	});
});
