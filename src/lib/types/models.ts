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

export interface ModelManagerSPDownloadProgress {
	status?: string | number;
	progress?: number;
}

export interface ModelManagerSPArtifact {
	downloadProgress?: ModelManagerSPDownloadProgress;
}

export interface ModelManagerSPModel {
	artifact?: ModelManagerSPArtifact;
}

export interface ModelManagerSPBundle {
	ref?: string;
	models?: ModelManagerSPModel[];
}

export interface ModelManagerSPMessage {
	selectedBundle?: ModelManagerSPBundle;
}

const DOWNLOAD_STATUS_BY_ORDINAL: Record<number, 'downloading' | 'downloaded' | 'cached'> = {
	1: 'downloading',
	2: 'downloaded',
	3: 'cached'
};

function downloadStatus(
	status: string | number | undefined
): 'downloading' | 'downloaded' | 'cached' | undefined {
	if (typeof status === 'string') {
		const s = status.toLowerCase();
		return s === 'downloading' || s === 'downloaded' || s === 'cached' ? s : undefined;
	}
	return typeof status === 'number' ? DOWNLOAD_STATUS_BY_ORDINAL[status] : undefined;
}

export function computeDownloadProgress(
	models: ModelManagerSPModel[] | undefined
): { percent: number; anyDownloading: boolean } | undefined {
	if (!models || models.length === 0) return undefined;

	let progress = 0;
	let anyDownloading = false;
	for (const model of models) {
		const p = model?.artifact?.downloadProgress;
		const status = downloadStatus(p?.status);
		if (status === 'downloading') {
			anyDownloading = true;
			progress += typeof p?.progress === 'number' ? p.progress : 0;
		} else if (status === 'downloaded' || status === 'cached') {
			progress += 100;
		}
	}
	return { percent: Math.round(progress / models.length), anyDownloading };
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
