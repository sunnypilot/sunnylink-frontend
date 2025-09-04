import { PUBLIC_API_URL } from '$env/static/public'; // Import from dynamic/public
import createClient from 'openapi-fetch';
import type { paths } from '../types/v1';

export const sunnylinkClient = createClient<paths>({
	baseUrl: PUBLIC_API_URL ?? 'https://stg.api.sunnypilot.ai/' // Use the env variable
});
