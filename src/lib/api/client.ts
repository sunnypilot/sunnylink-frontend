import createClient from "openapi-fetch";
import type { paths } from "../../sunnylink/v1/schema";

export const client = createClient<paths>({
	baseUrl: "https://stg.api.sunnypilot.ai/",
});

