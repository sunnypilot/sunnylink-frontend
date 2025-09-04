import type { operations } from './v1';
import { z } from 'zod';

export type Device =
	operations['GetDevicesForUser']['responses']['200']['content']['application/json'];

const DownloadURISchema = z.object({
	url: z.string().url(),
	sha256: z.string().min(1)
});

enum Environment {
	Development = 'development',
	Release = 'release'
}

enum FileNameNav {
	NavmodelQGen1Dlc = 'navmodel_q_gen1.dlc',
	NavmodelQGen2Dlc = 'navmodel_q_gen2.dlc',
	NavmodelQGen3Dlc = 'navmodel_q_gen3.dlc'
}

enum FullNameNav {
	Gen1 = 'gen1',
	Gen2 = 'gen2',
	Gen3 = 'gen3'
}

const EnvironmentSchema = z.nativeEnum(Environment);
const FileNameNavSchema = z.nativeEnum(FileNameNav);
const FullNameNavSchema = z.nativeEnum(FullNameNav);

const ModelSchema = z.object({
	display_name: z.string(),
	full_name: z.string(),
	is_20hz: z.boolean().optional(),
	ref: z.string().optional(),
	environment: EnvironmentSchema,
	runner: z.number(),
	index: z.string(),
	minimum_selector_version: z.string(),
	file_name: z.string(),
	download_uri: DownloadURISchema,
	generation: z.string(),
	full_name_metadata: z.string(),
	file_name_metadata: z.string(),
	download_uri_metadata: DownloadURISchema,
	full_name_nav: FullNameNavSchema.optional(),
	file_name_nav: FileNameNavSchema.optional(),
	downloadURINav: DownloadURISchema.optional()
});

export type Model = z.infer<typeof ModelSchema>;

export interface ModelArray extends Model {
	modelName: string;
}
