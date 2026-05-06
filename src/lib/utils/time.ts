/**
 * Format a timestamp into a relative "X ago" string.
 * Returns "just now" for <15s, "Xs ago" for <60s, "Xm ago" for <60m,
 * "Xh ago" for <24h, date otherwise.
 */
export function formatRelativeTime(timestampMs: number): string {
	const now = Date.now();
	const diffMs = now - timestampMs;

	if (diffMs < 0 || !Number.isFinite(diffMs)) return 'just now';
	if (diffMs < 15_000) return 'just now';

	const seconds = Math.floor(diffMs / 1_000);
	if (seconds < 60) return `${seconds}s ago`;

	const minutes = Math.floor(diffMs / 60_000);
	if (minutes < 60) return `${minutes}m ago`;

	const hours = Math.floor(diffMs / 3_600_000);
	if (hours < 24) return `${hours}h ago`;

	const date = new Date(timestampMs);
	return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}
