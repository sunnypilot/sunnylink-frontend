// Feed store for /dashboard/whats-new and the topbar notification bell.
//
// Source: community.sunnypilot.ai category 112 (Announcements), filtered by
// tag `sunnylink-feed`. Read/unread state is local-only (per-device); cross-
// device sync would require a backend and is out of scope.
//
// Lifecycle: +layout.svelte starts the store once auth is established and
// stops it on sign-out. Polling is 60s, gated on document.visibilityState so
// it silently pauses when the tab is backgrounded.

import { toast } from 'svelte-sonner';
import { goto } from '$app/navigation';
import {
	fetchCategoryTopics,
	fetchTopicDetail,
	hasRequiredTag,
	type DiscourseTopic,
	type DiscourseTopicDetail
} from '$lib/api/discourse';

const TOPICS_CACHE_KEY = 'sunnylink_whats_new_topics';
const BODY_CACHE_PREFIX = 'sunnylink_whats_new_body_';
const READ_STATE_KEY = 'sunnylink_whats_new_read';
const TOPICS_TTL = 5 * 60 * 1000;
const BODY_TTL = 60 * 60 * 1000;
const POLL_INTERVAL_MS = 60_000;

export type CachedBody = {
	cooked: string;
	views: number;
	likeCount: number;
	replyCount: number;
	authorUsername?: string;
	authorAvatarTemplate?: string;
	fetchedAt: number;
};

type CachePayload<T> = { ts: number; data: T };

let topics = $state<DiscourseTopic[]>([]);
let readMap = $state<Record<number, number>>({});
let bodies = $state<Record<number, CachedBody>>({});
let bodyLoading = $state<Record<number, boolean>>({});
let initialLoading = $state(true);
let hasLoaded = $state(false);
let hasMorePages = $state(false);
let currentPage = $state(0);
let nextPageLoading = $state(false);
let newArrivalIds = $state<number[]>([]);
let lastFetchedAt = $state(0);

let pollId: ReturnType<typeof setInterval> | null = null;
let lifecycleStarted = false;

function readCache<T>(key: string, ttl: number): T | null {
	if (typeof window === 'undefined') return null;
	try {
		const raw = localStorage.getItem(key);
		if (!raw) return null;
		const payload = JSON.parse(raw) as CachePayload<T>;
		if (Date.now() - payload.ts > ttl) return null;
		return payload.data;
	} catch {
		return null;
	}
}

function writeCache<T>(key: string, data: T): void {
	if (typeof window === 'undefined') return;
	try {
		const payload: CachePayload<T> = { ts: Date.now(), data };
		localStorage.setItem(key, JSON.stringify(payload));
	} catch {
		/* quota */
	}
}

function loadReadMap(): Record<number, number> {
	if (typeof window === 'undefined') return {};
	try {
		const raw = localStorage.getItem(READ_STATE_KEY);
		if (!raw) return {};
		const parsed = JSON.parse(raw) as Record<number, number>;
		return parsed ?? {};
	} catch {
		return {};
	}
}

function persistReadMap(): void {
	if (typeof window === 'undefined') return;
	try {
		localStorage.setItem(READ_STATE_KEY, JSON.stringify(readMap));
	} catch {
		/* quota */
	}
}

function sortTopics(list: DiscourseTopic[]): DiscourseTopic[] {
	return [...list].sort((a, b) => {
		if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
		const at = new Date(a.last_posted_at || a.created_at).getTime();
		const bt = new Date(b.last_posted_at || b.created_at).getTime();
		return bt - at;
	});
}

function dedupeMerge(existing: DiscourseTopic[], incoming: DiscourseTopic[]): DiscourseTopic[] {
	const byId = new Map<number, DiscourseTopic>();
	for (const t of existing) byId.set(t.id, t);
	for (const t of incoming) byId.set(t.id, t);
	return sortTopics(Array.from(byId.values()));
}

async function fetchPage(page: number): Promise<DiscourseTopic[] | null> {
	const res = await fetchCategoryTopics(page);
	if (!res) return null;
	hasMorePages = res.hasMore;
	return res.topics.filter((t) => t.visible && hasRequiredTag(t));
}

async function refresh(opts: { silent?: boolean } = {}): Promise<void> {
	try {
		const fresh = await fetchPage(0);
		if (!fresh) {
			if (!hasLoaded) topics = [];
			return;
		}
		const beforeIds = new Set(topics.map((t) => t.id));
		const arrivals = fresh
			.filter((t) => !beforeIds.has(t.id))
			.filter((t) => (readMap[t.id] ?? 0) < (t.highest_post_number ?? 1))
			.map((t) => t.id);
		const merged = dedupeMerge(topics, fresh);
		topics = merged;
		lastFetchedAt = Date.now();
		hasLoaded = true;
		currentPage = 0;
		writeCache(TOPICS_CACHE_KEY, merged);

		// Only silent refreshes (polling after first load) surface new-arrival
		// signals. Initial cold loads populate the feed with historical topics;
		// firing toasts for all of them on first visit would be spam.
		if (opts.silent && arrivals.length > 0) {
			newArrivalIds = [...newArrivalIds, ...arrivals];
			const first = merged.find((t) => t.id === arrivals[0]);
			if (first) {
				const extra = arrivals.length - 1;
				toast.info(first.title, {
					description:
						extra > 0
							? `New announcement · +${extra} more`
							: 'New announcement from the sunnypilot team',
					duration: 6000,
					action: {
						label: 'Read',
						onClick: () => void goto(`/dashboard/whats-new/${first.id}`)
					}
				});
			}
		}
	} finally {
		initialLoading = false;
	}
}

async function loadNextPage(): Promise<void> {
	if (nextPageLoading) return;
	if (!hasMorePages) return;
	nextPageLoading = true;
	try {
		const nextPage = currentPage + 1;
		const incoming = await fetchPage(nextPage);
		if (!incoming) return;
		topics = dedupeMerge(topics, incoming);
		currentPage = nextPage;
		writeCache(TOPICS_CACHE_KEY, topics);
	} finally {
		nextPageLoading = false;
	}
}

function extractBodyCache(detail: DiscourseTopicDetail): CachedBody {
	const post0 = detail.post_stream?.posts?.[0];
	return {
		cooked: post0?.cooked ?? '',
		views: detail.views ?? 0,
		likeCount: detail.like_count ?? 0,
		replyCount: detail.reply_count ?? 0,
		authorUsername: post0?.username,
		authorAvatarTemplate: post0?.avatar_template,
		fetchedAt: Date.now()
	};
}

async function ensureBody(
	topic: Pick<DiscourseTopic, 'id' | 'slug'>,
	opts: { trackView?: boolean } = {}
): Promise<void> {
	const cacheKey = `${BODY_CACHE_PREFIX}${topic.id}`;

	if (opts.trackView) {
		// View-counter bump must hit the network; always go through to Discourse
		// with the track-view header regardless of local body cache. Paint from
		// cache first if we have it so the user sees content immediately.
		const cached = bodies[topic.id] ?? readCache<CachedBody>(cacheKey, BODY_TTL);
		if (cached) bodies[topic.id] = cached;
		bodyLoading[topic.id] = !bodies[topic.id];
		try {
			const detail = await fetchTopicDetail(topic.id, topic.slug, { trackView: true });
			if (!detail) return;
			const extract = extractBodyCache(detail);
			bodies[topic.id] = extract;
			writeCache(cacheKey, extract);
		} finally {
			bodyLoading[topic.id] = false;
		}
		return;
	}

	if (bodies[topic.id]) return;
	const cached = readCache<CachedBody>(cacheKey, BODY_TTL);
	if (cached) {
		bodies[topic.id] = cached;
		return;
	}

	bodyLoading[topic.id] = true;
	try {
		const detail = await fetchTopicDetail(topic.id, topic.slug);
		if (!detail) return;
		const extract = extractBodyCache(detail);
		bodies[topic.id] = extract;
		writeCache(cacheKey, extract);
	} finally {
		bodyLoading[topic.id] = false;
	}
}

function markRead(topicId: number): void {
	const topic = topics.find((t) => t.id === topicId);
	if (!topic) return;
	const highest = topic.highest_post_number ?? 1;
	if ((readMap[topicId] ?? 0) >= highest) return;
	readMap = { ...readMap, [topicId]: highest };
	persistReadMap();
	if (newArrivalIds.includes(topicId)) {
		newArrivalIds = newArrivalIds.filter((id) => id !== topicId);
	}
}

function markUnread(topicId: number): void {
	if (!(topicId in readMap)) return;
	const next = { ...readMap };
	delete next[topicId];
	readMap = next;
	persistReadMap();
}

function markReadMany(ids: number[]): void {
	const next: Record<number, number> = { ...readMap };
	let changed = false;
	const arrivals = new Set(newArrivalIds);
	for (const id of ids) {
		const topic = topics.find((t) => t.id === id);
		if (!topic) continue;
		const highest = topic.highest_post_number ?? 1;
		if ((next[id] ?? 0) < highest) {
			next[id] = highest;
			changed = true;
			arrivals.delete(id);
		}
	}
	if (!changed) return;
	readMap = next;
	persistReadMap();
	newArrivalIds = Array.from(arrivals);
}

function markUnreadMany(ids: number[]): void {
	const next: Record<number, number> = { ...readMap };
	let changed = false;
	for (const id of ids) {
		if (id in next) {
			delete next[id];
			changed = true;
		}
	}
	if (!changed) return;
	readMap = next;
	persistReadMap();
}

function markAllRead(): void {
	let changed = false;
	const next: Record<number, number> = { ...readMap };
	for (const t of topics) {
		const highest = t.highest_post_number ?? 1;
		if ((next[t.id] ?? 0) < highest) {
			next[t.id] = highest;
			changed = true;
		}
	}
	if (!changed) return;
	readMap = next;
	persistReadMap();
	newArrivalIds = [];
}

function consumeNewArrivals(): DiscourseTopic[] {
	if (newArrivalIds.length === 0) return [];
	const ids = new Set(newArrivalIds);
	const matched = topics.filter((t) => ids.has(t.id));
	newArrivalIds = [];
	return matched;
}

function handleVisibilityChange(): void {
	if (typeof document === 'undefined') return;
	if (document.visibilityState !== 'visible') return;
	// Tab regained focus — opportunistic refresh. If it races with the interval
	// tick the second call is a near-no-op (same cache key, same 5-min TTL) but
	// surfacing the freshest feed on tab-return is worth the extra request.
	void refresh({ silent: true });
}

function startLifecycle(): void {
	if (lifecycleStarted) return;
	lifecycleStarted = true;
	if (typeof window === 'undefined') return;
	void init();
	if (typeof document !== 'undefined') {
		document.addEventListener('visibilitychange', handleVisibilityChange);
	}
	pollId = setInterval(() => {
		if (typeof document === 'undefined') return;
		if (document.visibilityState !== 'visible') return;
		void refresh({ silent: true });
	}, POLL_INTERVAL_MS);
}

function stopLifecycle(): void {
	if (!lifecycleStarted) return;
	lifecycleStarted = false;
	if (pollId) {
		clearInterval(pollId);
		pollId = null;
	}
	if (typeof document !== 'undefined') {
		document.removeEventListener('visibilitychange', handleVisibilityChange);
	}
}

async function init(): Promise<void> {
	if (typeof window === 'undefined') return;
	if (Object.keys(readMap).length === 0) {
		readMap = loadReadMap();
	}
	const cached = readCache<DiscourseTopic[]>(TOPICS_CACHE_KEY, TOPICS_TTL);
	if (cached && cached.length > 0) {
		topics = sortTopics(cached);
		hasLoaded = true;
		initialLoading = false;
	}
	await refresh({ silent: hasLoaded });
}

export const whatsNewStore = {
	get topics() {
		return topics;
	},
	get readMap() {
		return readMap;
	},
	get bodies() {
		return bodies;
	},
	get bodyLoading() {
		return bodyLoading;
	},
	get initialLoading() {
		return initialLoading;
	},
	get hasLoaded() {
		return hasLoaded;
	},
	get nextPageLoading() {
		return nextPageLoading;
	},
	get hasMorePages() {
		return hasMorePages;
	},
	get lastFetchedAt() {
		return lastFetchedAt;
	},
	get unread() {
		return topics.filter((t) => (readMap[t.id] ?? 0) < (t.highest_post_number ?? 1));
	},
	get unreadCount() {
		return topics.reduce(
			(n, t) => n + ((readMap[t.id] ?? 0) < (t.highest_post_number ?? 1) ? 1 : 0),
			0
		);
	},
	get latestTopic() {
		return topics[0] ?? null;
	},
	get latestUnread() {
		return this.unread[0] ?? null;
	},
	get hasNewArrivals() {
		return newArrivalIds.length > 0;
	},

	isUnread(topicId: number): boolean {
		const t = topics.find((x) => x.id === topicId);
		if (!t) return false;
		return (readMap[topicId] ?? 0) < (t.highest_post_number ?? 1);
	},

	init,
	refresh,
	loadNextPage,
	ensureBody,
	markRead,
	markUnread,
	markReadMany,
	markUnreadMany,
	markAllRead,
	consumeNewArrivals,
	startLifecycle,
	stopLifecycle
};
