// Public Discourse JSON client for the /dashboard/whats-new feed.
//
// Routes through the Netlify redirect at /api/discourse/* → community.sunnypilot.ai
// (see netlify.toml). All endpoints are public; no auth required.
//
// View-counter: pass `trackView: true` on fetchTopicDetail to increment
// topic.views. This is what the Discourse UI sends on a topic page view via
// the Discourse-Track-View header. Omitted by default so list-level prefetches
// don't inflate stats.

export const PROXY_PREFIX = '/api/discourse';
export const FORUM_HOST = 'https://community.sunnypilot.ai';
export const CATEGORY_ID = 112;
export const CATEGORY_SLUG = 'announcements';
export const REQUIRED_TAG = 'sunnylink-feed';

// 429 retry: silent attempts at 3s, 10s. Matches GitHub Octokit / Stripe SDK
// retry posture for rate-limit-only errors; other statuses fall straight through.
const RETRY_DELAYS_MS = [3000, 10000];

export interface DiscourseTag {
	id: number;
	name: string;
	slug: string;
}

export interface DiscoursePoster {
	extras?: string | null;
	description?: string;
	user_id?: number;
	primary_group_id?: number | null;
}

export interface DiscourseTopic {
	id: number;
	title: string;
	fancy_title?: string;
	slug: string;
	posts_count: number;
	reply_count: number;
	highest_post_number: number;
	image_url: string | null;
	created_at: string;
	last_posted_at: string;
	bumped_at?: string;
	pinned: boolean;
	unpinned?: boolean | null;
	visible: boolean;
	closed: boolean;
	archived: boolean;
	views: number;
	like_count: number;
	has_accepted_answer?: boolean | null;
	tags: DiscourseTag[] | string[];
	category_id: number;
	excerpt?: string;
	posters?: DiscoursePoster[];
}

export interface DiscoursePost {
	id: number;
	post_number: number;
	username: string;
	name?: string;
	avatar_template: string;
	cooked: string;
	created_at: string;
	updated_at?: string;
	display_username?: string;
}

export interface DiscourseTopicDetail {
	id: number;
	title: string;
	fancy_title: string;
	slug: string;
	tags: string[];
	highest_post_number: number;
	views: number;
	like_count: number;
	posts_count: number;
	reply_count: number;
	pinned: boolean;
	closed: boolean;
	archived: boolean;
	visible: boolean;
	created_at: string;
	last_posted_at: string;
	category_id: number;
	image_url?: string | null;
	post_stream: {
		posts: DiscoursePost[];
		stream: number[];
	};
	details?: {
		created_by?: {
			id: number;
			username: string;
			avatar_template: string;
			name?: string;
		};
	};
}

export interface CategoryListResponse {
	topic_list: {
		per_page: number;
		top_tags?: DiscourseTag[];
		more_topics_url?: string | null;
		topics: DiscourseTopic[];
	};
}

async function fetchWithRetry(url: string, init?: RequestInit): Promise<Response | null> {
	// `cache: no-store` forces a network trip every time. Discourse sets
	// Cache-Control headers on category/topic JSON that the browser will
	// otherwise honour — meaning a topic tagged `sunnylink-feed` after the
	// first empty fetch won't surface until the cache entry expires. Our own
	// 5-min localStorage cache already throttles actual server hits.
	const mergedInit: RequestInit = { cache: 'no-store', ...(init ?? {}) };
	const delays = [0, ...RETRY_DELAYS_MS];
	let res: Response | null = null;
	for (const delay of delays) {
		if (delay > 0) await new Promise((r) => setTimeout(r, delay));
		try {
			res = await fetch(url, mergedInit);
			if (res.status !== 429) return res;
		} catch {
			res = null;
		}
	}
	return res;
}

export function topicNameTags(topic: DiscourseTopic): string[] {
	if (!topic.tags || topic.tags.length === 0) return [];
	const first = topic.tags[0] as unknown;
	if (typeof first === 'string') return topic.tags as string[];
	return (topic.tags as DiscourseTag[]).map((t) => t.name);
}

export function hasRequiredTag(topic: DiscourseTopic): boolean {
	return topicNameTags(topic).includes(REQUIRED_TAG);
}

export async function fetchCategoryTopics(
	page = 0
): Promise<{ topics: DiscourseTopic[]; hasMore: boolean } | null> {
	const query = page > 0 ? `?page=${page}` : '';
	const res = await fetchWithRetry(
		`${PROXY_PREFIX}/c/${CATEGORY_SLUG}/${CATEGORY_ID}.json${query}`
	);
	if (!res || !res.ok) return null;
	const data = (await res.json()) as CategoryListResponse;
	const topics = data?.topic_list?.topics ?? [];
	const hasMore = Boolean(data?.topic_list?.more_topics_url);
	return { topics, hasMore };
}

export async function fetchTopicDetail(
	id: number,
	slug: string,
	opts: { trackView?: boolean } = {}
): Promise<DiscourseTopicDetail | null> {
	const headers: Record<string, string> = { Accept: 'application/json' };
	if (opts.trackView) headers['Discourse-Track-View'] = 'true';
	const res = await fetchWithRetry(`${PROXY_PREFIX}/t/${slug}/${id}.json`, { headers });
	if (!res || !res.ok) return null;
	return (await res.json()) as DiscourseTopicDetail;
}

export function forumTopicUrl(topic: Pick<DiscourseTopic, 'slug' | 'id'>): string {
	return `${FORUM_HOST}/t/${topic.slug}/${topic.id}`;
}

export function avatarUrl(template: string | undefined | null, size = 48): string | null {
	if (!template) return null;
	const full = template.startsWith('http') ? template : `${FORUM_HOST}${template}`;
	return full.replace('{size}', String(size));
}
