import { v1Client, v0Client } from '$lib/api/client';
import { logtoClient } from '$lib/logto/auth.svelte';
import type { PageLoad } from './$types';
import type { DeviceAuthResponseModel } from '../../sunnylink/types';

export const load: PageLoad = async () => {
	let aggregatedDeviceDetails: DeviceAuthResponseModel[] = [];

	if (!logtoClient) return;
	const devices = await v1Client.GET('/v1/users/{userId}/devices', {
		params: {
			path: {
				userId: 'self'
			}
		},
		headers: {
			Authorization: `Bearer ${await logtoClient.getIdToken()}`
		}
	});

	for (const device of devices.data?.items ?? []) {
		const deviceDetails = await v0Client.GET('/device/{deviceId}', {
			params: {
				path: {
					deviceId: device.device_id ?? ''
				}
			},
			headers: {
				Authorization: `Bearer ${await logtoClient.getIdToken()}`
			}
		});

		if (deviceDetails.data) {
			aggregatedDeviceDetails.push(deviceDetails.data);
		}
	}

	return { devices: aggregatedDeviceDetails };
};

export const prerender = false;
export const ssr = false;
