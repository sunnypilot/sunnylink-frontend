import { browser } from '$app/environment';

const STORAGE_KEY = 'sunnylink_preferences';

export interface PreferencesData {
	debugMode: boolean;
	showDeviceOnlineHelp: boolean;
	showLegacyBanner: boolean;
}

const DEFAULTS: PreferencesData = {
	debugMode: false,
	showDeviceOnlineHelp: true,
	showLegacyBanner: true
};

class PreferencesStore {
	debugMode = $state(DEFAULTS.debugMode);
	showDeviceOnlineHelp = $state(DEFAULTS.showDeviceOnlineHelp);
	showLegacyBanner = $state(DEFAULTS.showLegacyBanner);

	constructor() {
		if (browser) {
			this._loadFromStorage();
			this._migrateLegacyKeys();

			$effect.root(() => {
				$effect(() => {
					this._saveToStorage();
				});
			});
		}
	}

	private _loadFromStorage(): void {
		const stored = localStorage.getItem(STORAGE_KEY);
		if (stored) {
			try {
				const parsed = JSON.parse(stored) as Partial<PreferencesData>;
				if (parsed.debugMode !== undefined) this.debugMode = parsed.debugMode;
				if (parsed.showDeviceOnlineHelp !== undefined)
					this.showDeviceOnlineHelp = parsed.showDeviceOnlineHelp;
				if (parsed.showLegacyBanner !== undefined) this.showLegacyBanner = parsed.showLegacyBanner;
				return;
			} catch {
				// Fall through to legacy keys
			}
		}

		// Legacy individual keys
		const storedDebug = localStorage.getItem('sunnylink_debug_mode');
		const storedOnlineHelp = localStorage.getItem('sunnylink_show_device_online_help');
		if (storedDebug) this.debugMode = storedDebug === 'true';
		if (storedOnlineHelp) this.showDeviceOnlineHelp = storedOnlineHelp === 'true';
	}

	private _migrateLegacyKeys(): void {
		const legacySuppress = localStorage.getItem('suppressDeviceOnlineModal');
		if (legacySuppress === 'true') {
			this.showDeviceOnlineHelp = false;
			localStorage.removeItem('suppressDeviceOnlineModal');
		}

		const hadLegacy =
			localStorage.getItem('sunnylink_debug_mode') !== null ||
			localStorage.getItem('sunnylink_show_device_online_help') !== null;
		if (hadLegacy) {
			localStorage.removeItem('sunnylink_debug_mode');
			localStorage.removeItem('sunnylink_show_device_online_help');
		}
	}

	private _saveToStorage(): void {
		const data: PreferencesData = {
			debugMode: this.debugMode,
			showDeviceOnlineHelp: this.showDeviceOnlineHelp,
			showLegacyBanner: this.showLegacyBanner
		};
		localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
	}
}

export const preferences = new PreferencesStore();
