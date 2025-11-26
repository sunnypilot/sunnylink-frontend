import type { components } from '../../sunnylink/v1/schema';

export const deviceState = $state({
    selectedDeviceId: undefined as string | undefined,
    deviceSettings: {} as Record<string, components['schemas']['DeviceParamKey'][]>,
    deviceValues: {} as Record<string, Record<string, unknown>>,
    onlineStatuses: {} as Record<string, 'loading' | 'online' | 'offline'>
});
