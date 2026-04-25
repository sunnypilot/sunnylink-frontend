/**
 * Tracks whether the user has navigated within the app during this tab's
 * lifetime.
 *
 * BackLink consults this flag so it can prefer `history.back()` (which pops
 * the SvelteKit navigation as a popstate event — the browser restores the
 * prior page's scroll position and the layout's fade transition still plays)
 * when the browser has an in-app entry to return to, and fall back to an
 * explicit `goto()` / custom handler when the tab opened directly on a deep
 * link (history.back() would escape the app).
 */

let hasInternalNav = $state(false);

export const navHistory = {
	get hasInternalNav() {
		return hasInternalNav;
	},
	markInternalNav() {
		hasInternalNav = true;
	}
};
