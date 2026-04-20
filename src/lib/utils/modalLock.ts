/**
 * Svelte action: lock body scroll while a modal/overlay is open.
 *
 * Uses the iOS-safe pattern (`position: fixed` + preserved scrollY)
 * instead of `overflow: hidden` alone, since iOS Safari ignores the
 * latter on the body. Reference-counted so nested modals unlock only
 * when the last one closes.
 */

let lockCount = 0;
let savedScrollY = 0;

function lockScroll() {
	if (lockCount === 0) {
		savedScrollY = window.scrollY;
		const b = document.body.style;
		b.position = 'fixed';
		b.top = `-${savedScrollY}px`;
		b.left = '0';
		b.right = '0';
		b.width = '100%';
		b.overflow = 'hidden';
	}
	lockCount++;
}

function unlockScroll() {
	lockCount = Math.max(0, lockCount - 1);
	if (lockCount === 0) {
		const b = document.body.style;
		b.position = '';
		b.top = '';
		b.left = '';
		b.right = '';
		b.width = '';
		b.overflow = '';
		window.scrollTo(0, savedScrollY);
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
