export interface ModelArtifact {
	file_name: string;
	download_uri: {
		url: string;
		sha256: string;
	};
}

export interface ModelItem {
	type: 'vision' | 'policy' | 'supercombo' | 'navigation' | string;
	artifact: ModelArtifact;
	metadata?: ModelArtifact;
}

export interface ModelBundle {
	short_name: string;
	display_name: string;
	is_20hz: boolean;
	ref: string;
	environment: string;
	runner?: string;
	index?: number;
	minimum_selector_version?: string;
	generation?: string;
	build_time?: string;
	overrides?: Record<string, string>;
	models: ModelItem[];
}

export interface ModelManifest {
	tinygrad_ref?: string;
	bundles: ModelBundle[];
}

export function isModelManifest(data: unknown): data is ModelManifest {
	if (typeof data !== 'object' || data === null) {
		return false;
	}

	const manifest = data as ModelManifest;

	// Check if bundles exists and is an array
	if (!Array.isArray(manifest.bundles)) {
		return false;
	}

	// Validate that if there are items, they look like ModelBundle objects
	if (manifest.bundles.length > 0) {
		const item = manifest.bundles[0];
		return (
			typeof item === 'object' &&
			item !== null &&
			'display_name' in item &&
			typeof (item as ModelBundle).display_name === 'string' &&
			'models' in item &&
			Array.isArray((item as ModelBundle).models)
		);
	}

	return true;
}
