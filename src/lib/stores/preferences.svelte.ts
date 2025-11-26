import { browser } from '$app/environment';

class PreferencesStore {
    debugMode = $state(false);
    showAdvanced = $state(false);

    constructor() {
        if (browser) {
            const storedDebug = localStorage.getItem('sunnylink_debug_mode');
            const storedAdvanced = localStorage.getItem('sunnylink_show_advanced');

            if (storedDebug) this.debugMode = storedDebug === 'true';
            if (storedAdvanced) this.showAdvanced = storedAdvanced === 'true';

            $effect.root(() => {
                $effect(() => {
                    localStorage.setItem('sunnylink_debug_mode', String(this.debugMode));
                    localStorage.setItem('sunnylink_show_advanced', String(this.showAdvanced));
                });
            });
        }
    }
}

export const preferences = new PreferencesStore();
