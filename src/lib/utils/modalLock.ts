/**
 * Svelte action: lock body scroll while a modal/overlay is open.
 *
 * iOS Safari is the hard case. `overflow: hidden` on body alone is
 * ignored once the user touches; the layout viewport also lets the
 * browser chrome (URL bar) animate in/out during touch drags, which
 * looks like "the page is scrolling" even when nothing moves in the
 * document. The combination below is the known-good recipe:
 *
 *   - body `position: fixed` + saved scrollY so the content freezes
 *   - html + body `overflow: hidden` to block fallback scroll paths
 *   - html `overscroll-behavior: none` to kill rubber-band chaining
 *   - `touchmove` listener that preventDefault's any gesture outside
 *     a truly scrollable descendant (lets internal lists still scroll)
 *
 * Reference-counted so nested modals unlock only when the last one
 * closes.
 */

let lockCount = 0;
let savedScrollY = 0;
let lockedPathname: string | null = null;
let touchMoveHandler: ((e: TouchEvent) => void) | null = null;

function findScrollableAncestor(start: EventTarget | null): HTMLElement | null {
	let el = start as HTMLElement | null;
	while (el && el !== document.body && el !== document.documentElement) {
		const style = window.getComputedStyle(el);
		const oy = style.overflowY;
		if ((oy === 'auto' || oy === 'scroll') && el.scrollHeight > el.clientHeight) {
			return el;
		}
		el = el.parentElement;
	}
	return null;
}

function lockScroll() {
	if (lockCount === 0) {
		savedScrollY = window.scrollY;
		lockedPathname = window.location.pathname;
		const b = document.body.style;
		const h = document.documentElement.style;
		b.position = 'fixed';
		b.top = `-${savedScrollY}px`;
		b.left = '0';
		b.right = '0';
		b.width = '100%';
		b.overflow = 'hidden';
		h.overflow = 'hidden';
		h.overscrollBehavior = 'none';

		// Swallow touchmove outside scrollable descendants. iOS still
		// rubber-bands otherwise, which makes the whole viewport appear
		// to drift even though `position: fixed` freezes layout.
		touchMoveHandler = (e: TouchEvent) => {
			if (e.touches.length !== 1) return;
			const scroller = findScrollableAncestor(e.target);
			if (scroller) return; // let the inner list scroll naturally
			if (e.cancelable) e.preventDefault();
		};
		document.addEventListener('touchmove', touchMoveHandler, { passive: false });
	}
	lockCount++;
}

function unlockScroll() {
	lockCount = Math.max(0, lockCount - 1);
	if (lockCount === 0) {
		const b = document.body.style;
		const h = document.documentElement.style;
		b.position = '';
		b.top = '';
		b.left = '';
		b.right = '';
		b.width = '';
		b.overflow = '';
		h.overflow = '';
		h.overscrollBehavior = '';
		if (touchMoveHandler) {
			document.removeEventListener('touchmove', touchMoveHandler);
			touchMoveHandler = null;
		}
		// Only restore scroll when the modal closes in place. If a navigation
		// happened while the lock was held (e.g. AccountMenu → Preferences link),
		// the layout's afterNavigate has already reset scroll to 0 for the new
		// route; restoring savedScrollY here would clobber that and drop the
		// user into the middle of the new page.
		if (lockedPathname === window.location.pathname) {
			window.scrollTo(0, savedScrollY);
		}
		lockedPathname = null;
	}
}

export function modalLock(_node: HTMLElement) {
	lockScroll();
	return {
		destroy() {
			unlockScroll();
		}
	};
}
