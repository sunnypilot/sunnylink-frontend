/**
 * Per-URL scroll-top memo for the app's inner scroll container.
 *
 * Moving the app's scroll from the browser's document viewport to a fixed-
 * height inner container is what blocks iOS Safari's pull-to-refresh (the
 * gesture is document-level; inner containers don't participate). But it
 * also means SvelteKit's built-in scroll restoration — which drives
 * `window.scrollTo` — becomes a no-op. The layout saves the container's
 * scrollTop in `beforeNavigate` and restores it in `afterNavigate` on
 * popstate so browser back / BackLink still lands the user where they were.
 *
 * In-memory only. Cleared on full page refresh, which matches what users
 * expect from a fresh load.
 */

const positions = new Map<string, number>();

export const scrollPositions = {
	save(key: string, top: number) {
		positions.set(key, top);
	},
	load(key: string): number {
		return positions.get(key) ?? 0;
	}
};
