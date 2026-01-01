import { demoContext } from './demoContext.svelte';
import { deviceState } from '$lib/stores/device.svelte';

type DemoDeviceState = 'online' | 'offline' | 'error' | 'onroad';

type DemoDevice = {
	device_id: string;
	comma_dongle_id: string;
	alias: string;
	created_at: number;
	state: DemoDeviceState;
	forceOffroad?: boolean;
	errorMessage?: string;
};

const baseDevices: DemoDevice[] = [
	{
		device_id: 'SL-DMO-ALPHA',
		comma_dongle_id: 'demo-alpha-001',
		alias: 'Atlas (Online)',
		created_at: Math.floor(Date.now() / 1000) - 86400 * 2,
		state: 'online',
		forceOffroad: false
	},
	{
		device_id: 'SL-DMO-BETA',
		comma_dongle_id: 'demo-beta-002',
		alias: 'Boreal (Offline)',
		created_at: Math.floor(Date.now() / 1000) - 86400 * 7,
		state: 'offline'
	},
	{
		device_id: 'SL-DMO-GAMMA',
		comma_dongle_id: 'demo-gamma-003',
		alias: 'Cobalt (Error)',
		created_at: Math.floor(Date.now() / 1000) - 86400 * 14,
		state: 'error',
		errorMessage: 'Device reported sensor fault'
	},
	{
		device_id: 'SL-DMO-DELTA',
		comma_dongle_id: 'demo-delta-004',
		alias: 'Daedalus (Onroad)',
		created_at: Math.floor(Date.now() / 1000) - 86400,
		state: 'onroad',
		forceOffroad: false
	}
];

let demoDevices: DemoDevice[] = [];

const randomDelay = () => 100 + Math.floor(Math.random() * 800);
const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

function cloneDevices() {
	return baseDevices.map((d) => ({ ...d }));
}

function applyDevicesToStore(resetSelection = false) {
	deviceState.onlineStatuses = {};
	deviceState.lastErrorMessages = {};
	deviceState.offroadStatuses = {};
	deviceState.deviceValues = {};
	deviceState.deviceSettings = {};
	deviceState.aliasOverrides = {};
	deviceState.stagedChanges = {};

	for (const device of demoDevices) {
		let status: 'online' | 'offline' | 'error' = 'online';
		if (device.state === 'offline') status = 'offline';
		if (device.state === 'error') status = 'error';

		deviceState.onlineStatuses[device.device_id] = status;
		if (status === 'error' && device.errorMessage) {
			deviceState.lastErrorMessages[device.device_id] = device.errorMessage;
		}

		deviceState.offroadStatuses[device.device_id] = {
			isOffroad: device.state !== 'onroad',
			forceOffroad: Boolean(device.forceOffroad)
		};
		deviceState.aliases[device.device_id] = device.alias;
	}

	if (resetSelection) {
		deviceState.selectedDeviceId = undefined;
	}

	deviceState.version++;
}

export async function activateDemoMode(resetSelection = false) {
	demoContext.isActive = true;
	if (demoDevices.length === 0 || resetSelection) {
		demoDevices = cloneDevices();
		applyDevicesToStore(true);
	}
	await wait(randomDelay());
	return demoDevices;
}

export async function ensureDemoDevices() {
	demoContext.isActive = true;
	if (demoDevices.length === 0) {
		demoDevices = cloneDevices();
		applyDevicesToStore(true);
	}
	await wait(randomDelay());
	return demoDevices;
}

export async function resetDemoMode() {
	demoDevices = cloneDevices();
	applyDevicesToStore(true);
	await wait(randomDelay());
	return demoDevices;
}

export function deactivateDemoMode() {
	if (!demoContext.isActive) return;
	demoContext.isActive = false;
	demoDevices = [];
}

export async function demoCheckDeviceStatus(deviceId: string) {
	const device = demoDevices.find((d) => d.device_id === deviceId);
	await wait(randomDelay());
	if (!device) return;

	let status: 'online' | 'offline' | 'error' = 'online';
	if (device.state === 'offline') status = 'offline';
	if (device.state === 'error') status = 'error';
	deviceState.onlineStatuses[deviceId] = status;

	if (status === 'error' && device.errorMessage) {
		deviceState.lastErrorMessages[deviceId] = device.errorMessage;
	}

	deviceState.offroadStatuses[deviceId] = {
		isOffroad: device.state !== 'onroad',
		forceOffroad: Boolean(device.forceOffroad)
	};
	deviceState.version++;
}

export async function demoSetDeviceParams(
	deviceId: string,
	params: { key: string; value: any }[]
) {
	const device = demoDevices.find((d) => d.device_id === deviceId);
	await wait(randomDelay());
	if (!device) return { ok: true };

	params.forEach((param) => {
		if (param.key === 'OffroadMode') {
			const force = param.value === true || param.value === '1' || param.value === 'true';
			device.forceOffroad = force;
			device.state = force ? 'online' : 'onroad';
		}
		if (param.key === 'IsOffroad') {
			const offroad = param.value === true || param.value === '1' || param.value === 'true';
			device.state = offroad ? 'online' : 'onroad';
		}
		if (param.key === 'CarPlatformBundle') {
			deviceState.deviceValues[deviceId] = {
				...(deviceState.deviceValues[deviceId] || {}),
				CarPlatformBundle: param.value
			};
		}
	});

	deviceState.offroadStatuses[deviceId] = {
		isOffroad: device.state !== 'onroad',
		forceOffroad: Boolean(device.forceOffroad)
	};
	deviceState.version++;
	return { ok: true };
}

export async function demoDeregisterDevice(deviceId: string) {
	await wait(randomDelay());
	demoDevices = demoDevices.filter((d) => d.device_id !== deviceId);
	applyDevicesToStore();
	return { ok: true };
}

export async function demoGetCarList() {
	await wait(randomDelay());
	return [
		{
			id: 'demo-car-1',
			make: 'Hyundai',
			model: 'Ioniq 5',
			year: 2024
		},
		{
			id: 'demo-car-2',
			make: 'Toyota',
			model: 'RAV4',
			year: 2023
		}
	];
}

export function getDemoDevicesSnapshot() {
	return demoDevices;
}
