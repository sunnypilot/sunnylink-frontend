import { browser } from '$app/environment';

export function getCurrentTheme() {
	if (browser) {
		return localStorage.getItem('theme') ?? '';
	}
}
