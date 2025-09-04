export interface DownloadURI {
	url: string;
	sha256: string;
}

export interface ModelArtifact {
	file_name: string;
	download_uri: DownloadURI;
}

export interface ModelEntry {
	type: string;
	artifact: ModelArtifact;
	metadata: ModelArtifact;
}

export interface BundleOverrides {
	folder: string;
	lat: number;
	long: number;
}

export interface ModelBundle {
	short_name: string;
	display_name: string;
	is_20hz: boolean;
	ref: string;
	environment: 'release' | 'development';
	runner: string;
	index: number;
	minimum_selector_version: string;
	generation: string;
	overrides: BundleOverrides;
	models: ModelEntry[];
	build_time?: string;
}

export interface ModelsV7Response {
	tinygrad_ref: string;
	bundles: ModelBundle[];
}

export type ModelsV7 = ModelsV7Response;