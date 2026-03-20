import { browser } from '$app/environment';

const STORAGE_KEY = 'sunnylink_preferences';

export interface PreferencesData {
	debugMode: boolean;
	showDeviceOnlineHelp: boolean;
	defaultLandingPage: 'overview' | 'steering' | 'device' | 'last_visited';
	notifyDeviceOffline: boolean;
	notifySyncFailure: boolean;
	notifySettingsDrift: boolean;
}

const DEFAULTS: PreferencesData = {
	debugMode: false,
	showDeviceOnlineHelp: true,
	defaultLandingPage: 'overview',
	notifyDeviceOffline: true,
	notifySyncFailure: true,
	notifySettingsDrift: true
};

class PreferencesStore {
	debugMode = $state(DEFAULTS.debugMode);
	showDeviceOnlineHelp = $state(DEFAULTS.showDeviceOnlineHelp);
	defaultLandingPage = $state<PreferencesData['defaultLandingPage']>(DEFAULTS.defaultLandingPage);
	notifyDeviceOffline = $state(DEFAULTS.notifyDeviceOffline);
	notifySyncFailure = $state(DEFAULTS.notifySyncFailure);
	notifySettingsDrift = $state(DEFAULTS.notifySettingsDrift);

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
		// Try unified key first
		const stored = localStorage.getItem(STORAGE_KEY);
		if (stored) {
			try {
				const parsed = JSON.parse(stored) as Partial<PreferencesData>;
				if (parsed.debugMode !== undefined) this.debugMode = parsed.debugMode;
				if (parsed.showDeviceOnlineHelp !== undefined) this.showDeviceOnlineHelp = parsed.showDeviceOnlineHelp;
				if (parsed.defaultLandingPage !== undefined) this.defaultLandingPage = parsed.defaultLandingPage;
				if (parsed.notifyDeviceOffline !== undefined) this.notifyDeviceOffline = parsed.notifyDeviceOffline;
				if (parsed.notifySyncFailure !== undefined) this.notifySyncFailure = parsed.notifySyncFailure;
				if (parsed.notifySettingsDrift !== undefined) this.notifySettingsDrift = parsed.notifySettingsDrift;
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
		// Migrate legacy suppressDeviceOnlineModal
		const legacySuppress = localStorage.getItem('suppressDeviceOnlineModal');
		if (legacySuppress === 'true') {
			this.showDeviceOnlineHelp = false;
			localStorage.removeItem('suppressDeviceOnlineModal');
		}

		// Clean up old individual keys after migration
		const hadLegacy = localStorage.getItem('sunnylink_debug_mode') !== null ||
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
			defaultLandingPage: this.defaultLandingPage,
			notifyDeviceOffline: this.notifyDeviceOffline,
			notifySyncFailure: this.notifySyncFailure,
			notifySettingsDrift: this.notifySettingsDrift
		};
		localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
	}
}

export const preferences = new PreferencesStore();
