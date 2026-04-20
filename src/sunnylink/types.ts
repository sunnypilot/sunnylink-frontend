import type { paths as APIv0Paths } from './v0/schema_api';

export type DeviceAuthResponseModel =
	APIv0Paths['/device/{deviceId}']['get']['responses']['200']['content']['application/json'];
