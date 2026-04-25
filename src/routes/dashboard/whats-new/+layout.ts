import { redirect } from '@sveltejs/kit';
import { FEATURES } from '$lib/config/features';

export const prerender = false;
export const ssr = false;

export function load() {
	if (!FEATURES.whatsNewRoute) {
		throw redirect(302, '/dashboard');
	}
}
