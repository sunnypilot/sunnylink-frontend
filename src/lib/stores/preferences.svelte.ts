import { browser } from '$app/environment';

class PreferencesStore {
    debugMode = $state(false);
    showAdvanced = $state(false);
    showDeviceOnlineHelp = $state(true);
    favoriteToggles = $state<string[]>([]);

    constructor() {
        if (browser) {
            const storedDebug = localStorage.getItem('sunnylink_debug_mode');
            const storedAdvanced = localStorage.getItem('sunnylink_show_advanced');
            const storedOnlineHelp = localStorage.getItem('sunnylink_show_device_online_help');
            const storedFavorites = localStorage.getItem('sunnylink_favorite_toggles');

            if (storedDebug) this.debugMode = storedDebug === 'true';
            if (storedAdvanced) this.showAdvanced = storedAdvanced === 'true';
            if (storedOnlineHelp) this.showDeviceOnlineHelp = storedOnlineHelp === 'true';
            if (storedFavorites) {
                try {
                    this.favoriteToggles = JSON.parse(storedFavorites);
                } catch (e) {
                    console.error('Failed to parse favorites', e);
                }
            }
            // Check for legacy key and migrate if needed
            const legacySuppress = localStorage.getItem('suppressDeviceOnlineModal');
            if (legacySuppress === 'true') {
                this.showDeviceOnlineHelp = false;
                localStorage.removeItem('suppressDeviceOnlineModal');
            }

            $effect.root(() => {
                $effect(() => {
                    localStorage.setItem('sunnylink_debug_mode', String(this.debugMode));
                    localStorage.setItem('sunnylink_show_advanced', String(this.showAdvanced));
                    localStorage.setItem('sunnylink_show_device_online_help', String(this.showDeviceOnlineHelp));
                    localStorage.setItem('sunnylink_favorite_toggles', JSON.stringify(this.favoriteToggles));
                });
            });
        }
    }

    toggleFavorite(key: string) {
        if (this.favoriteToggles.includes(key)) {
            this.favoriteToggles = this.favoriteToggles.filter(k => k !== key);
        } else {
            this.favoriteToggles = [...this.favoriteToggles, key];
        }
    }

    isFavorite(key: string) {
        return this.favoriteToggles.includes(key);
    }
}

export const preferences = new PreferencesStore();
