/**
 * Theme Store
 *
 * Manages light/dark/auto theme preference with localStorage persistence
 * and system preference detection via prefers-color-scheme media query.
 */

import { browser } from '$app/environment';

export type ThemePreference = 'light' | 'dark' | 'auto';
export type EffectiveTheme = 'light' | 'dark';

const STORAGE_KEY = 'sunnylink_theme';
const LIGHT_THEME = 'sunny-light';
const DARK_THEME = 'sunny-dark';

class ThemeStore {
	preference = $state<ThemePreference>('auto');
	effective = $state<EffectiveTheme>('dark');

	constructor() {
		if (browser) {
			// Load saved preference
			const stored = localStorage.getItem(STORAGE_KEY) as ThemePreference | null;
			if (stored && ['light', 'dark', 'auto'].includes(stored)) {
				this.preference = stored;
			}

			// Compute and apply initial theme
			this.effective = this._resolve(this.preference);
			this._apply(this.effective);

			// Listen for system preference changes
			window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
				if (this.preference === 'auto') {
					this.effective = this._resolve('auto');
					this._apply(this.effective);
				}
			});

			// React to preference changes
			$effect.root(() => {
				$effect(() => {
					const eff = this._resolve(this.preference);
					this.effective = eff;
					this._apply(eff);
					localStorage.setItem(STORAGE_KEY, this.preference);
				});
			});
		}
	}

	setPreference(pref: ThemePreference) {
		this.preference = pref;
	}

	private _resolve(pref: ThemePreference): EffectiveTheme {
		if (pref === 'auto') {
			if (!browser) return 'dark';
			return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
		}
		return pref;
	}

	private _apply(theme: EffectiveTheme) {
		if (!browser) return;
		const themeName = theme === 'dark' ? DARK_THEME : LIGHT_THEME;
		document.documentElement.setAttribute('data-theme', themeName);
		// Update meta theme-color for PWA
		const meta = document.querySelector('meta[name="theme-color"]');
		if (meta) {
			meta.setAttribute('content', theme === 'dark' ? '#0c0b14' : '#f8f7fc');
		}
	}
}

export const themeState = new ThemeStore();
