<script lang="ts">
	import { onMount } from 'svelte';
	import { page } from '$app/state';
	import { goto } from '$app/navigation';
	import { ArrowLeft, ExternalLink, Loader2 } from 'lucide-svelte';
	import { whatsNewStore } from '$lib/stores/whatsNew.svelte';
	import {
		avatarUrl,
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
	const cached = $derived(topic ? whatsNewStore.bodies[topic.id] : undefined);

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

	onMount(() => {
		void whatsNewStore.init();
	});

	// Body loader + fallback topic fetch for deep-link cold starts where the
	// store hasn't loaded the feed yet (direct URL paste, refresh on detail).
	$effect(() => {
		if (!topicId) return;
		const known = whatsNewStore.topics.find((t) => t.id === topicId);
		if (known) {
			void whatsNewStore.ensureBody(known, { trackView: true });
			whatsNewStore.markRead(known.id);
			return;
		}
		if (fallbackTopic || fallbackLoading || fallbackFailed) return;
		fallbackLoading = true;
		(async () => {
			// We don't have a slug yet — use id-only path; Discourse redirects to
			// the slugged URL but the JSON endpoint accepts id alone via /t/{id}.
			const detail = await fetchTopicDetail(topicId, String(topicId), { trackView: true });
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
				category_id: detail.category_id
			};
			if (!hasRequiredTag(topicShape)) {
				// The topic exists but isn't on the sunnylink feed — bounce to the
				// list rather than surfacing an off-topic forum post.
				goto('/dashboard/whats-new', { replaceState: true });
				return;
			}
			fallbackTopic = topicShape;
			const post0 = detail.post_stream?.posts?.[0];
			whatsNewStore.bodies[topicShape.id] = {
				cooked: post0?.cooked ?? '',
				views: detail.views,
				likeCount: detail.like_count,
				replyCount: detail.reply_count,
				authorUsername: post0?.username,
				authorAvatarTemplate: post0?.avatar_template,
				fetchedAt: Date.now()
			};
			whatsNewStore.markRead(topicShape.id);
			fallbackLoading = false;
		})();
	});

	const avatarSrc = $derived(avatarUrl(cached?.authorAvatarTemplate, 64));
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
		<article
			class="overflow-hidden rounded-2xl border border-[var(--sl-border)] bg-[var(--sl-bg-surface)]"
		>
			{#if topic.image_url}
				<div class="aspect-[16/7] w-full overflow-hidden bg-[var(--sl-bg-elevated)]">
					<img src={topic.image_url} alt="" class="h-full w-full object-cover" />
				</div>
			{/if}
			<header class="flex flex-col gap-3 border-b border-[var(--sl-border-muted)] px-5 py-5 sm:px-7">
				<h1
					class="text-[1.5rem] leading-tight font-semibold tracking-[-0.015em] text-[var(--sl-text-1)] sm:text-[1.75rem]"
				>
					{topic.title}
				</h1>
				<div class="flex items-center gap-2 text-[0.8125rem] text-[var(--sl-text-3)]">
					{#if avatarSrc}
						<img
							src={avatarSrc}
							alt=""
							loading="lazy"
							class="h-5 w-5 rounded-full"
						/>
					{/if}
					{#if cached?.authorUsername}
						<span class="font-medium text-[var(--sl-text-2)]">@{cached.authorUsername}</span>
						<span aria-hidden="true">·</span>
					{/if}
					<span>{formatDate(topic.created_at)}</span>
				</div>
			</header>
			<div class="px-5 py-6 sm:px-7">
				{#if whatsNewStore.bodyLoading[topic.id] && !cached?.cooked}
					<div class="flex items-center gap-2 text-[var(--sl-text-3)]">
						<Loader2 size={14} class="animate-spin" aria-hidden="true" />
						<span class="text-[0.8125rem]">Loading…</span>
					</div>
				{:else if cached?.cooked}
					<div
						class="prose prose-sm max-w-none text-[var(--sl-text-2)] sm:prose-base dark:prose-invert prose-headings:text-[var(--sl-text-1)] prose-a:text-primary prose-strong:text-[var(--sl-text-1)]"
					>
						<!-- eslint-disable-next-line svelte/no-at-html-tags -->
						{@html cached.cooked}
					</div>
				{:else}
					<p class="text-[0.8125rem] text-[var(--sl-text-3)]">
						Couldn't load this post.
						<a
							href={forumTopicUrl(topic)}
							target="_blank"
							rel="noopener"
							class="text-primary hover:underline"
						>
							Read on the forum
						</a>
					</p>
				{/if}
			</div>
			<footer
				class="border-t border-[var(--sl-border-muted)] px-5 py-4 sm:px-7"
			>
				<a
					href={forumTopicUrl(topic)}
					target="_blank"
					rel="noopener"
					class="inline-flex items-center gap-1.5 text-[0.8125rem] font-medium text-[var(--sl-text-2)] transition-colors hover:text-[var(--sl-text-1)] hover:underline"
				>
					Discuss on community forum
					<ExternalLink size={12} aria-hidden="true" />
				</a>
			</footer>
		</article>
	{/if}
</div>
