import createClient from 'openapi-fetch';
import type { paths as v1Paths } from '../../sunnylink/v1/schema';
import type { paths as v0Paths } from '../../sunnylink/v0/schema';

export const v1Client = createClient<v1Paths>({
	baseUrl: 'https://stg.api.sunnypilot.ai/'
});

export const v0Client = createClient<v0Paths>({
	baseUrl: 'https://stg.api.sunnypilot.ai/'
});
