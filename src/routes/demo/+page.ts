import type { PageLoad } from './$types';
import { redirect } from '@sveltejs/kit';

export const load: PageLoad = async () => {
	throw redirect(307, '/dashboard');
};

export const prerender = false;
export const ssr = false;
