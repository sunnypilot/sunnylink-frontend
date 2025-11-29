import { browser } from '$app/environment';

class PreferencesStore {
    debugMode = $state(false);
    showAdvanced = $state(false);
    showDeviceOnlineHelp = $state(true);

    constructor() {
        if (browser) {
            const storedDebug = localStorage.getItem('sunnylink_debug_mode');
            const storedAdvanced = localStorage.getItem('sunnylink_show_advanced');
            const storedOnlineHelp = localStorage.getItem('sunnylink_show_device_online_help');

            if (storedDebug) this.debugMode = storedDebug === 'true';
            if (storedAdvanced) this.showAdvanced = storedAdvanced === 'true';
            if (storedOnlineHelp) this.showDeviceOnlineHelp = storedOnlineHelp === 'true';
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
                });
            });
        }
    }
}

export const preferences = new PreferencesStore();
