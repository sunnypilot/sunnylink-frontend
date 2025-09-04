import type { LayoutLoad } from './$types';

export const load: LayoutLoad = async ({ parent }) => {
	const { isAuthenticated, user, logtoClient } = await parent();

	return {
		isAuthenticated,
		user,
		logtoClient
	};
};