// Favicon badge painter. Overlays a small red dot on the browser tab icon
// when there are unread notifications; restores the original on zero.
//
// Safari/iOS ignore dynamic favicon mutation silently. Treat as best-effort
// graceful degradation — desktop Chrome / Firefox / Edge all update live.

let originalLinkEl: HTMLLinkElement | null = null;
let originalHref: string | null = null;
let baseImage: HTMLImageElement | null = null;
let baseLoaded = false;
let lastState: boolean | null = null;

function ensureOriginal(): HTMLLinkElement | null {
	if (originalLinkEl) return originalLinkEl;
	const existing = document.querySelector<HTMLLinkElement>('link[rel="icon"]');
	if (!existing) return null;
	originalLinkEl = existing;
	originalHref = existing.href;
	return existing;
}

function ensureImage(onload: () => void): void {
	if (baseImage && baseLoaded) {
		onload();
		return;
	}
	if (!ensureOriginal() || !originalHref) return;
	baseImage = new Image();
	baseImage.crossOrigin = 'anonymous';
	baseImage.onload = () => {
		baseLoaded = true;
		onload();
	};
	baseImage.onerror = () => {
		baseImage = null;
		baseLoaded = false;
	};
	baseImage.src = originalHref;
}

export function paintBadge(show: boolean): void {
	if (typeof document === 'undefined') return;
	if (lastState === show) return;
	const link = ensureOriginal();
	if (!link || !originalHref) return;

	if (!show) {
		link.href = originalHref;
		lastState = false;
		return;
	}

	ensureImage(() => {
		if (!baseImage || !baseLoaded || !link) return;
		const size = 64;
		const canvas = document.createElement('canvas');
		canvas.width = size;
		canvas.height = size;
		const ctx = canvas.getContext('2d');
		if (!ctx) return;
		ctx.drawImage(baseImage, 0, 0, size, size);

		const dotR = size * 0.2;
		const cx = size - dotR - 2;
		const cy = size - dotR - 2;

		// White halo so the dot reads against any base colour.
		ctx.beginPath();
		ctx.arc(cx, cy, dotR + 2, 0, Math.PI * 2);
		ctx.fillStyle = '#ffffff';
		ctx.fill();

		ctx.beginPath();
		ctx.arc(cx, cy, dotR, 0, Math.PI * 2);
		ctx.fillStyle = '#ef4444';
		ctx.fill();

		try {
			link.href = canvas.toDataURL('image/png');
			lastState = true;
		} catch {
			// Tainted canvas (cross-origin favicon) — leave unchanged.
		}
	});
}
