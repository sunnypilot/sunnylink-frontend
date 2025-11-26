import { v1Client, v0Client } from '$lib/api/client';
import { logtoClient } from '$lib/logto/auth.svelte';
import type { PageLoad } from './$types';
import type { DeviceAuthResponseModel } from '../../sunnylink/types';

export const load: PageLoad = async () => {
	return {};
};

export const prerender = false;
export const ssr = false;
