import { PUBLIC_API_URL } from '$env/static/public'; // Import from dynamic/public
import createClient from 'openapi-fetch';
import type { paths } from '../types/sunnylink_v0';
import type { paths as paths_v1 } from '../types/sunnylink_v1';

export const sunnylinkClient = createClient<paths>({
	baseUrl: PUBLIC_API_URL ?? 'https://stg.api.sunnypilot.ai/' // Use the env variable
});

export const sunnylinkClientV1 = createClient<paths_v1>({
	baseUrl: PUBLIC_API_URL ?? 'https://stg.api.sunnypilot.ai/' // Use the env variable
});
