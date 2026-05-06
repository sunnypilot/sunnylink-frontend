/**
 * Svelte action that portals an element to document.body.
 * Escapes stacking contexts (e.g., drawer-side z-[51]) so modals
 * always render above the sidebar and all other content.
 */
export function portal(node: HTMLElement) {
	document.body.appendChild(node);
	return {
		destroy() {
			node.remove();
		}
	};
}
