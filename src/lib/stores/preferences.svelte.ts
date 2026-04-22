import { browser } from '$app/environment';

const STORAGE_KEY = 'sunnylink_preferences';

export interface PreferencesData {
	debugMode: boolean;
	showDeviceOnlineHelp: boolean;
	autoRefresh: boolean;
	defaultLandingPage: 'overview' | 'steering' | 'device' | 'last_visited';
	notifyDeviceOffline: boolean;
	notifySyncFailure: boolean;
	notifySettingsDrift: boolean;
	showLegacyBanner: boolean;
}

/** Detect browser/OS data saver mode */
function detectSaveData(): boolean {
	if (typeof navigator === 'undefined') return false;
	return !!(navigator as any).connection?.saveData;
}

// Auto-refresh defaults to OFF. Manual refresh (RefreshIndicator) is the
// primary mechanism. See references/polling.md for the policy rationale —
// at 100k users each 60s poll fans out to ~5 RPC calls per device.
const DEFAULTS: PreferencesData = {
	debugMode: false,
	showDeviceOnlineHelp: true,
	autoRefresh: false,
	defaultLandingPage: 'overview',
	notifyDeviceOffline: true,
	notifySyncFailure: true,
	notifySettingsDrift: true,
	showLegacyBanner: true
};

class PreferencesStore {
	debugMode = $state(DEFAULTS.debugMode);
	showDeviceOnlineHelp = $state(DEFAULTS.showDeviceOnlineHelp);
	autoRefresh = $state(DEFAULTS.autoRefresh);
	defaultLandingPage = $state<PreferencesData['defaultLandingPage']>(DEFAULTS.defaultLandingPage);
	notifyDeviceOffline = $state(DEFAULTS.notifyDeviceOffline);
	notifySyncFailure = $state(DEFAULTS.notifySyncFailure);
	notifySettingsDrift = $state(DEFAULTS.notifySettingsDrift);
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
		// Try unified key first
		const stored = localStorage.getItem(STORAGE_KEY);
		if (stored) {
			try {
				const parsed = JSON.parse(stored) as Partial<PreferencesData>;
				if (parsed.debugMode !== undefined) this.debugMode = parsed.debugMode;
				if (parsed.showDeviceOnlineHelp !== undefined)
					this.showDeviceOnlineHelp = parsed.showDeviceOnlineHelp;
				if (parsed.autoRefresh !== undefined) this.autoRefresh = parsed.autoRefresh;
				if (parsed.defaultLandingPage !== undefined)
					this.defaultLandingPage = parsed.defaultLandingPage;
				if (parsed.notifyDeviceOffline !== undefined)
					this.notifyDeviceOffline = parsed.notifyDeviceOffline;
				if (parsed.notifySyncFailure !== undefined)
					this.notifySyncFailure = parsed.notifySyncFailure;
				if (parsed.notifySettingsDrift !== undefined)
					this.notifySettingsDrift = parsed.notifySettingsDrift;
				if (parsed.showLegacyBanner !== undefined)
					this.showLegacyBanner = parsed.showLegacyBanner;
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
		const hadLegacy =
			localStorage.getItem('sunnylink_debug_mode') !== null ||
			localStorage.getItem('sunnylink_show_device_online_help') !== null;
		if (hadLegacy) {
			localStorage.removeItem('sunnylink_debug_mode');
			localStorage.removeItem('sunnylink_show_device_online_help');
		}

		// One-time reset of autoRefresh to the new manual-first default. Existing
		// users who had it on from the previous default get flipped off once;
		// they can re-enable via Preferences if they want live updates.
		const autoRefreshMigrated = localStorage.getItem('sunnylink_auto_refresh_migrated_v2');
		if (autoRefreshMigrated !== 'true') {
			this.autoRefresh = false;
			localStorage.setItem('sunnylink_auto_refresh_migrated_v2', 'true');
		}
	}

	private _saveToStorage(): void {
		const data: PreferencesData = {
			debugMode: this.debugMode,
			showDeviceOnlineHelp: this.showDeviceOnlineHelp,
			autoRefresh: this.autoRefresh,
			defaultLandingPage: this.defaultLandingPage,
			notifyDeviceOffline: this.notifyDeviceOffline,
			notifySyncFailure: this.notifySyncFailure,
			notifySettingsDrift: this.notifySettingsDrift,
			showLegacyBanner: this.showLegacyBanner
		};
		localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
	}
}

export const preferences = new PreferencesStore();
