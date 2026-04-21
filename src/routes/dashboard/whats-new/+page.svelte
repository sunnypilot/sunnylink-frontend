<script lang="ts">
	import { onMount } from 'svelte';
	import { slide } from 'svelte/transition';
	import { ChevronDown, Loader2, ExternalLink, Sparkles } from 'lucide-svelte';

	type Tag = { name: string };
	type Topic = {
		id: number;
		title: string;
		slug: string;
		created_at: string;
		tags: Tag[];
	};

	const REQUIRED_TAGS = ['sunnylink', 'official-updates'];
	const CATEGORY_ID = 112;
	const FORUM_HOST = 'https://community.sunnypilot.ai';
	const PROXY_PREFIX = '/api/discourse';
	const TOPICS_CACHE_KEY = 'sunnylink_whats_new_topics';
	const BODY_CACHE_PREFIX = 'sunnylink_whats_new_body_';
	const TOPICS_TTL = 5 * 60 * 1000;
	const BODY_TTL = 60 * 60 * 1000;

	let topics = $state<Topic[]>([]);
	let bodies = $state<Record<number, string>>({});
	let bodyLoading = $state<Record<number, boolean>>({});
	let loading = $state(true);
	let error = $state<string | null>(null);
	let expandedId = $state<number | null>(null);

	function readJSONCache<T>(key: string, ttl: number): T | null {
		try {
			const raw = localStorage.getItem(key);
			if (!raw) return null;
			const { ts, data } = JSON.parse(raw);
			if (Date.now() - ts > ttl) return null;
			return data as T;
		} catch {
			return null;
		}
	}

	function writeJSONCache(key: string, data: unknown) {
		try {
			localStorage.setItem(key, JSON.stringify({ ts: Date.now(), data }));
		} catch {
			/* quota */
		}
	}

	async function loadTopics() {
		const cached = readJSONCache<Topic[]>(TOPICS_CACHE_KEY, TOPICS_TTL);
		if (cached) {
			topics = cached;
			loading = false;
			if (cached[0]) void expandTopic(cached[0]);
			return;
		}

		try {
			const res = await fetch(`${PROXY_PREFIX}/c/announcements/${CATEGORY_ID}.json`);
			if (!res.ok) throw new Error(`Forum returned ${res.status}`);
			const data = await res.json();
			const all: Topic[] = data?.topic_list?.topics ?? [];
			const filtered = all
				.filter((t) => {
					const names = (t.tags || []).map((x) => x.name);
					return REQUIRED_TAGS.every((req) => names.includes(req));
				})
				.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

			topics = filtered;
			writeJSONCache(TOPICS_CACHE_KEY, filtered);
			if (filtered[0]) void expandTopic(filtered[0]);
		} catch (e) {
			error = e instanceof Error ? e.message : 'Failed to load updates';
		} finally {
			loading = false;
		}
	}

	async function fetchBody(topic: Topic): Promise<string> {
		const cacheKey = `${BODY_CACHE_PREFIX}${topic.id}`;
		const cached = readJSONCache<string>(cacheKey, BODY_TTL);
		if (cached) return cached;

		const res = await fetch(`${PROXY_PREFIX}/t/${topic.slug}/${topic.id}.json`);
		if (!res.ok) throw new Error(`Forum returned ${res.status}`);
		const data = await res.json();
		const cooked = data?.post_stream?.posts?.[0]?.cooked ?? '';
		writeJSONCache(cacheKey, cooked);
		return cooked;
	}

	async function expandTopic(topic: Topic) {
		expandedId = topic.id;
		if (bodies[topic.id] || bodyLoading[topic.id]) return;

		bodyLoading[topic.id] = true;
		try {
			bodies[topic.id] = await fetchBody(topic);
		} catch {
			bodies[topic.id] = '';
		} finally {
			bodyLoading[topic.id] = false;
		}
	}

	function toggleExpand(topic: Topic) {
		if (expandedId === topic.id) {
			expandedId = null;
			return;
		}
		void expandTopic(topic);
	}

	function formatDate(iso: string): string {
		try {
			return new Date(iso).toLocaleDateString(undefined, {
				month: 'short',
				day: 'numeric',
				year: 'numeric'
			});
		} catch {
			return iso;
		}
	}

	onMount(loadTopics);
</script>

<svelte:head>
	<title>sunnylink - What's new</title>
</svelte:head>

<div class="mx-auto w-full max-w-3xl">
	<header class="mb-6 flex items-center gap-3">
		<div
			class="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary"
		>
			<Sparkles size={18} aria-hidden="true" />
		</div>
		<div class="min-w-0">
			<h1
				class="text-[1.375rem] leading-tight font-semibold tracking-[-0.01em] text-[var(--sl-text-1)]"
			>
				What's new
			</h1>
			<p class="mt-0.5 text-[0.8125rem] text-[var(--sl-text-3)]">
				Latest announcements from the sunnypilot team
			</p>
		</div>
	</header>

	{#if loading}
		<div class="flex items-center justify-center py-16 text-[var(--sl-text-3)]">
			<Loader2 size={20} class="animate-spin" aria-label="Loading" />
		</div>
	{:else if error}
		<div
			class="rounded-xl border border-red-500/30 bg-red-500/5 p-4 text-[0.8125rem] text-red-700 dark:text-red-300"
			role="alert"
		>
			Couldn't load updates: {error}
		</div>
	{:else if topics.length === 0}
		<div
			class="rounded-xl border border-dashed border-[var(--sl-border)] bg-[var(--sl-bg-surface)] px-6 py-12 text-center"
		>
			<p class="text-[0.875rem] font-medium text-[var(--sl-text-2)]">No announcements yet</p>
			<p class="mt-1 text-[0.8125rem] text-[var(--sl-text-3)]">
				Check back soon for the latest sunnylink updates
			</p>
		</div>
	{:else}
		<ul class="flex flex-col gap-3">
			{#each topics as topic (topic.id)}
				{@const isOpen = expandedId === topic.id}
				<li>
					<article
						class="overflow-hidden rounded-xl border border-[var(--sl-border)] bg-[var(--sl-bg-surface)] transition-colors"
						class:border-primary={isOpen}
					>
						<button
							type="button"
							onclick={() => toggleExpand(topic)}
							class="flex w-full items-center justify-between gap-3 px-4 py-3 text-left transition-colors hover:bg-[var(--sl-bg-elevated)]/50"
							aria-expanded={isOpen}
						>
							<div class="min-w-0 flex-1">
								<h2 class="truncate text-[0.9375rem] font-medium text-[var(--sl-text-1)]">
									{topic.title}
								</h2>
								<p class="mt-0.5 text-[0.75rem] text-[var(--sl-text-3)]">
									{formatDate(topic.created_at)}
								</p>
							</div>
							<ChevronDown
								size={16}
								class="shrink-0 text-[var(--sl-text-3)] transition-transform duration-150 {isOpen
									? 'rotate-180'
									: ''}"
								aria-hidden="true"
							/>
						</button>
						{#if isOpen}
							<div
								class="border-t border-[var(--sl-border-muted)] px-4 py-4"
								transition:slide={{ duration: 180 }}
							>
								{#if bodyLoading[topic.id]}
									<div class="flex items-center gap-2 text-[var(--sl-text-3)]">
										<Loader2 size={14} class="animate-spin" aria-hidden="true" />
										<span class="text-[0.8125rem]">Loading…</span>
									</div>
								{:else if bodies[topic.id]}
									<div
										class="prose prose-sm max-w-none text-[var(--sl-text-2)] dark:prose-invert prose-headings:text-[var(--sl-text-1)] prose-a:text-primary prose-strong:text-[var(--sl-text-1)]"
									>
										<!-- eslint-disable-next-line svelte/no-at-html-tags -->
										{@html bodies[topic.id]}
									</div>
									<a
										href="{FORUM_HOST}/t/{topic.slug}/{topic.id}"
										target="_blank"
										rel="noopener"
										class="mt-5 inline-flex items-center gap-1.5 text-[0.8125rem] font-medium text-primary hover:underline"
									>
										Discuss on community forum
										<ExternalLink size={12} aria-hidden="true" />
									</a>
								{:else}
									<p class="text-[0.8125rem] text-[var(--sl-text-3)]">
										Couldn't load this update.
										<a
											href="{FORUM_HOST}/t/{topic.slug}/{topic.id}"
											target="_blank"
											rel="noopener"
											class="text-primary hover:underline"
										>
											Read on the forum
										</a>
									</p>
								{/if}
							</div>
						{/if}
					</article>
				</li>
			{/each}
		</ul>
	{/if}
</div>
