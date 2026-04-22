<script lang="ts">
	import { onMount } from 'svelte';
	import { page } from '$app/state';
	import { goto } from '$app/navigation';
	import { ArrowLeft, ExternalLink, Loader2 } from 'lucide-svelte';
	import { whatsNewStore } from '$lib/stores/whatsNew.svelte';
	import {
		fetchTopicDetail,
		forumTopicUrl,
		hasRequiredTag,
		type DiscourseTopic
	} from '$lib/api/discourse';

	const topicId = $derived(Number(page.params.id));

	let fallbackTopic = $state<DiscourseTopic | null>(null);
	let fallbackLoading = $state(false);
	let fallbackFailed = $state(false);

	const topic = $derived(
		whatsNewStore.topics.find((t) => t.id === topicId) ?? fallbackTopic ?? null
	);
	const isUnread = $derived(topic ? whatsNewStore.isUnread(topic.id) : false);
	const bodyLoading = $derived(topic ? !!whatsNewStore.bodyLoading[topic.id] : false);

	function formatDate(iso: string): string {
		try {
			return new Date(iso).toLocaleString(undefined, {
				month: 'long',
				day: 'numeric',
				year: 'numeric'
			});
		} catch {
			return iso;
		}
	}

	function stripHtml(html: string): string {
		if (typeof document === 'undefined' || !html) return '';
		const tmp = document.createElement('div');
		tmp.innerHTML = html;
		return (tmp.textContent || '').replace(/\s+/g, ' ').trim();
	}

	function topicExcerpt(t: DiscourseTopic): string {
		if (!t.excerpt) return '';
		return t.excerpt.replace(/&hellip;\s*$/i, '…').replace(/\s+$/g, '');
	}

	function preview(t: DiscourseTopic): string {
		const body = whatsNewStore.bodies[t.id]?.cooked;
		if (body) return stripHtml(body);
		return topicExcerpt(t);
	}

	function openOnForum(e: MouseEvent, t: DiscourseTopic) {
		// iOS standalone PWAs ignore `target="_blank"` and navigate in-place.
		// Force a new tab via window.open + preventDefault.
		e.preventDefault();
		whatsNewStore.markRead(t.id);
		window.open(forumTopicUrl(t), '_blank', 'noopener,noreferrer');
	}

	onMount(() => {
		void whatsNewStore.init();
	});

	// Deep-link cold start: if the feed hasn't loaded yet, fetch this topic
	// directly so we can render its preview. Does NOT mark-read — only the
	// "Read on forum" button click clears the unread state.
	$effect(() => {
		if (!topicId) return;
		if (whatsNewStore.topics.find((t) => t.id === topicId)) return;
		if (fallbackTopic || fallbackLoading || fallbackFailed) return;
		fallbackLoading = true;
		(async () => {
			const detail = await fetchTopicDetail(topicId, String(topicId));
			if (!detail) {
				fallbackFailed = true;
				fallbackLoading = false;
				return;
			}
			const topicShape: DiscourseTopic = {
				id: detail.id,
				title: detail.title,
				fancy_title: detail.fancy_title,
				slug: detail.slug,
				posts_count: detail.posts_count,
				reply_count: detail.reply_count,
				highest_post_number: detail.highest_post_number,
				image_url: detail.image_url ?? null,
				created_at: detail.created_at,
				last_posted_at: detail.last_posted_at,
				pinned: detail.pinned,
				visible: detail.visible,
				closed: detail.closed,
				archived: detail.archived,
				views: detail.views,
				like_count: detail.like_count,
				tags: detail.tags,
				category_id: detail.category_id,
				excerpt:
					(detail.post_stream?.posts?.[0]?.cooked ?? '')
						.replace(/<[^>]+>/g, ' ')
						.replace(/\s+/g, ' ')
						.trim()
						.slice(0, 400) + '…'
			};
			if (!hasRequiredTag(topicShape)) {
				goto('/dashboard/whats-new', { replaceState: true });
				return;
			}
			fallbackTopic = topicShape;
			fallbackLoading = false;
		})();
	});

	// Fetch the full body so we can render the same stripped-HTML preview the
	// feed card used to show inline. Not a track-view bump — forum CTA is
	// still the only read signal.
	$effect(() => {
		if (!topic) return;
		if (whatsNewStore.bodies[topic.id]) return;
		void whatsNewStore.ensureBody(topic);
	});

	const title = $derived(topic?.title ?? '');
</script>

<svelte:head>
	<title>sunnylink - {title || "What's new"}</title>
</svelte:head>

<div class="mx-auto w-full max-w-3xl">
	<a
		href="/dashboard/whats-new"
		class="mb-4 inline-flex items-center gap-1.5 text-[0.8125rem] font-medium text-[var(--sl-text-2)] transition-colors hover:text-[var(--sl-text-1)] hover:underline"
	>
		<ArrowLeft size={14} aria-hidden="true" />
		All announcements
	</a>

	{#if fallbackLoading && !topic}
		<div class="flex items-center justify-center py-20 text-[var(--sl-text-3)]">
			<Loader2 size={20} class="animate-spin" aria-label="Loading" />
		</div>
	{:else if !topic || fallbackFailed}
		<div
			class="rounded-xl border border-dashed border-[var(--sl-border)] bg-[var(--sl-bg-surface)] px-6 py-12 text-center"
		>
			<p class="text-[0.875rem] font-medium text-[var(--sl-text-2)]">Post not found</p>
			<p class="mt-1 text-[0.8125rem] text-[var(--sl-text-3)]">
				It may have been removed or is not a sunnylink announcement.
			</p>
			<a
				href="/dashboard/whats-new"
				class="mt-4 inline-flex items-center gap-1.5 text-[0.8125rem] font-medium text-primary hover:underline"
			>
				Back to What's new
			</a>
		</div>
	{:else}
		{@const previewText = preview(topic)}
		<article
			class="overflow-hidden rounded-2xl border border-[var(--sl-border)] bg-[var(--sl-bg-surface)]"
		>
			{#if topic.image_url}
				<div class="aspect-[16/7] w-full overflow-hidden bg-[var(--sl-bg-elevated)]">
					<img src={topic.image_url} alt="" class="h-full w-full object-cover" />
				</div>
			{/if}
			<header class="border-b border-[var(--sl-border-muted)] px-5 py-5 sm:px-7">
				<h1
					class="text-[1.5rem] leading-tight font-semibold tracking-[-0.015em] text-[var(--sl-text-1)] sm:text-[1.75rem]"
				>
					{topic.title}
				</h1>
				<p class="mt-2 text-[0.8125rem] text-[var(--sl-text-3)]">
					{formatDate(topic.created_at)}
				</p>
			</header>
			<div class="px-5 py-6 sm:px-7">
				{#if bodyLoading && !previewText}
					<div class="flex items-center gap-2 text-[var(--sl-text-3)]">
						<Loader2 size={14} class="animate-spin" aria-hidden="true" />
						<span class="text-[0.8125rem]">Loading preview…</span>
					</div>
				{:else if previewText}
					<div class="relative">
						<p
							class="line-clamp-3 text-[0.9375rem] leading-relaxed text-[var(--sl-text-2)]"
						>
							{previewText}
						</p>
						<div
							class="pointer-events-none absolute inset-x-0 bottom-0 h-8 bg-gradient-to-t from-[var(--sl-bg-surface)] to-transparent"
							aria-hidden="true"
						></div>
					</div>
					<p class="mt-4 text-[0.8125rem] text-[var(--sl-text-3)]">
						Continue reading on the community forum →
					</p>
				{:else}
					<p class="text-[0.8125rem] text-[var(--sl-text-3)]">
						No preview available — read the full post on the community forum.
					</p>
				{/if}
				<div class="mt-6 flex justify-end">
					<a
						href={forumTopicUrl(topic)}
						target="_blank"
						rel="noopener noreferrer"
						onclick={(e) => openOnForum(e, topic)}
						class="relative inline-flex h-10 items-center justify-center gap-1.5 rounded-lg border border-[var(--sl-border)] bg-[var(--sl-bg-elevated)]/60 px-4 text-[0.875rem] font-medium text-[var(--sl-text-2)] transition-colors hover:bg-[var(--sl-bg-elevated)] hover:text-[var(--sl-text-1)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary active:scale-[0.98]"
					>
						<span>Read on forum</span>
						<ExternalLink size={13} aria-hidden="true" />
						{#if isUnread}
							<span
								class="absolute -top-1 -right-1 inline-flex h-2.5 w-2.5 rounded-full bg-red-500 ring-2 ring-[var(--sl-bg-surface)]"
								aria-label="Unread announcement"
							></span>
						{/if}
					</a>
				</div>
			</div>
		</article>
	{/if}
</div>
