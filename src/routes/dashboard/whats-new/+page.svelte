<script lang="ts">
	import { onMount } from 'svelte';
	import { slide } from 'svelte/transition';
	import {
		ChevronDown,
		ExternalLink,
		Loader2,
		Maximize2,
		Pin,
		Sparkles,
		CheckCheck
	} from 'lucide-svelte';
	import { whatsNewStore } from '$lib/stores/whatsNew.svelte';
	import { avatarUrl, forumTopicUrl, type DiscourseTopic } from '$lib/api/discourse';

	let expandedId = $state<number | null>(null);
	let sentinelEl = $state<HTMLDivElement | null>(null);

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

	async function toggleExpand(topic: DiscourseTopic) {
		if (expandedId === topic.id) {
			expandedId = null;
			return;
		}
		expandedId = topic.id;
		// Track-view bump is intentional on in-app expansion: the user is reading
		// this announcement and we want the forum's view counter to reflect that.
		await whatsNewStore.ensureBody(topic, { trackView: true });
		// Explicit expand is the only mark-read trigger on this page — users
		// were surprised when scroll-based dwell silently cleared the unread
		// badge. "Mark all read" button handles bulk dismissal.
		whatsNewStore.markRead(topic.id);
	}

	// Infinite-scroll sentinel. Loads the next page whenever the end-of-list
	// element enters the viewport. Store guards against double-fires.
	let sentinelObserver: IntersectionObserver | null = null;

	$effect(() => {
		if (!sentinelEl) return;
		sentinelObserver = new IntersectionObserver(
			(entries) => {
				for (const e of entries) {
					if (e.isIntersecting) void whatsNewStore.loadNextPage();
				}
			},
			{ rootMargin: '400px' }
		);
		sentinelObserver.observe(sentinelEl);
		return () => {
			sentinelObserver?.disconnect();
			sentinelObserver = null;
		};
	});

	onMount(() => {
		void whatsNewStore.init();
	});

	function topicExcerpt(topic: DiscourseTopic): string {
		if (!topic.excerpt) return '';
		// Discourse excerpts sometimes contain the "…" ellipsis continuation link;
		// strip trailing &hellip; / &hellip; markup remnants.
		return topic.excerpt.replace(/&hellip;\s*$/i, '…').replace(/\s+$/g, '');
	}

	function coverUrl(topic: DiscourseTopic): string | null {
		return topic.image_url || null;
	}

	function primaryAuthorAvatar(topic: DiscourseTopic): string | null {
		// On list responses the first post's avatar lives under topic.posters
		// referencing a separate users array; without that lookup we fall back
		// to the body-cache author if we've fetched detail already.
		const cached = whatsNewStore.bodies[topic.id];
		return avatarUrl(cached?.authorAvatarTemplate, 48);
	}

	const unreadCount = $derived(whatsNewStore.unreadCount);
</script>

<svelte:head>
	<title>sunnylink - What's new</title>
</svelte:head>

<div class="mx-auto w-full max-w-3xl">
	<header class="mb-6 flex items-start justify-between gap-3">
		<div class="flex min-w-0 items-center gap-3">
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
		</div>
		{#if unreadCount > 0}
			<button
				type="button"
				onclick={() => whatsNewStore.markAllRead()}
				class="inline-flex items-center gap-1.5 rounded-lg border border-[var(--sl-border)] bg-[var(--sl-bg-surface)] px-3 py-2 text-[0.75rem] font-medium text-[var(--sl-text-2)] transition-all duration-100 hover:bg-[var(--sl-bg-elevated)] hover:text-[var(--sl-text-1)] focus-visible:outline-2 focus-visible:outline-primary active:scale-[0.97] active:bg-[var(--sl-bg-subtle)]"
				aria-label="Mark all as read"
			>
				<CheckCheck size={14} aria-hidden="true" />
				<span class="hidden sm:inline">Mark all read</span>
				<span
					class="ml-0.5 inline-flex h-4 min-w-[1rem] items-center justify-center rounded-full bg-primary px-1 text-[0.625rem] font-semibold text-white"
				>
					{unreadCount}
				</span>
			</button>
		{/if}
	</header>

	{#if whatsNewStore.initialLoading && whatsNewStore.topics.length === 0}
		<div class="flex items-center justify-center py-16 text-[var(--sl-text-3)]">
			<Loader2 size={20} class="animate-spin" aria-label="Loading" />
		</div>
	{:else if whatsNewStore.topics.length === 0}
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
			{#each whatsNewStore.topics as topic (topic.id)}
				{@const isOpen = expandedId === topic.id}
				{@const isUnread = whatsNewStore.isUnread(topic.id)}
				{@const cover = coverUrl(topic)}
				{@const avatarSrc = primaryAuthorAvatar(topic)}
				{@const cachedBody = whatsNewStore.bodies[topic.id]}
				<li data-topic-id={topic.id}>
					<article
						class="overflow-hidden rounded-xl border bg-[var(--sl-bg-surface)] transition-colors {isOpen
							? 'border-primary/50'
							: 'border-[var(--sl-border)]'}"
					>
						<button
							type="button"
							onclick={() => toggleExpand(topic)}
							class="flex w-full items-start gap-3 px-4 py-3.5 text-left transition-colors hover:bg-[var(--sl-bg-elevated)]/40"
							aria-expanded={isOpen}
						>
							{#if cover}
								<div
									class="relative h-16 w-24 shrink-0 overflow-hidden rounded-lg bg-[var(--sl-bg-elevated)] sm:h-20 sm:w-32"
								>
									<img
										src={cover}
										alt=""
										loading="lazy"
										class="h-full w-full object-cover"
									/>
								</div>
							{/if}
							<div class="flex min-w-0 flex-1 flex-col gap-1.5">
								<div class="flex items-start gap-2">
									{#if isUnread}
										<span
											class="mt-1.5 inline-block h-2 w-2 shrink-0 rounded-full bg-primary"
											aria-label="Unread"
										></span>
									{/if}
									{#if topic.pinned}
										<Pin
											size={12}
											class="mt-1 shrink-0 text-[var(--sl-text-3)]"
											aria-label="Pinned"
										/>
									{/if}
									<h2
										class="text-[0.9375rem] leading-snug {isUnread
											? 'font-semibold text-[var(--sl-text-1)]'
											: 'font-medium text-[var(--sl-text-2)]'}"
									>
										{topic.title}
									</h2>
								</div>
								<div class="flex items-center gap-2 text-[0.75rem] text-[var(--sl-text-3)]">
									{#if avatarSrc}
										<img
											src={avatarSrc}
											alt=""
											loading="lazy"
											class="h-4 w-4 rounded-full"
										/>
									{/if}
									<span>{formatDate(topic.created_at)}</span>
								</div>
								{#if !isOpen && topicExcerpt(topic)}
									<p
										class="line-clamp-2 text-[0.8125rem] leading-relaxed text-[var(--sl-text-3)]"
									>
										{topicExcerpt(topic)}
									</p>
								{/if}
							</div>
							<ChevronDown
								size={16}
								class="mt-1 shrink-0 text-[var(--sl-text-3)] transition-transform duration-150 {isOpen
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
								{#if whatsNewStore.bodyLoading[topic.id] && !cachedBody?.cooked}
									<div class="flex items-center gap-2 text-[var(--sl-text-3)]">
										<Loader2 size={14} class="animate-spin" aria-hidden="true" />
										<span class="text-[0.8125rem]">Loading…</span>
									</div>
								{:else if cachedBody?.cooked}
									<div
										class="prose prose-sm max-w-none text-[var(--sl-text-2)] dark:prose-invert prose-headings:text-[var(--sl-text-1)] prose-a:text-primary prose-strong:text-[var(--sl-text-1)]"
									>
										<!-- eslint-disable-next-line svelte/no-at-html-tags -->
										{@html cachedBody.cooked}
									</div>
									<div class="mt-5 flex flex-wrap items-center gap-x-5 gap-y-2">
										<a
											href="/dashboard/whats-new/{topic.id}"
											class="inline-flex items-center gap-1.5 text-[0.8125rem] font-medium text-primary hover:underline"
										>
											Open full post
											<Maximize2 size={12} aria-hidden="true" />
										</a>
										<a
											href={forumTopicUrl(topic)}
											target="_blank"
											rel="noopener"
											class="inline-flex items-center gap-1.5 text-[0.8125rem] font-medium text-[var(--sl-text-2)] hover:text-[var(--sl-text-1)] hover:underline"
										>
											Discuss on community forum
											<ExternalLink size={12} aria-hidden="true" />
										</a>
									</div>
								{:else}
									<p class="text-[0.8125rem] text-[var(--sl-text-3)]">
										Couldn't load this update.
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
						{/if}
					</article>
				</li>
			{/each}
		</ul>

		{#if whatsNewStore.hasMorePages}
			<div
				bind:this={sentinelEl}
				class="flex items-center justify-center py-8 text-[var(--sl-text-3)]"
			>
				{#if whatsNewStore.nextPageLoading}
					<Loader2 size={16} class="animate-spin" aria-hidden="true" />
				{:else}
					<span class="text-[0.75rem]">Scroll for more</span>
				{/if}
			</div>
		{/if}
	{/if}
</div>
