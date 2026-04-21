<script lang="ts">
	import { onMount } from 'svelte';
	import { slide } from 'svelte/transition';
	import { ChevronDown, ExternalLink, Loader2, Pin, Sparkles } from 'lucide-svelte';
	import { whatsNewStore } from '$lib/stores/whatsNew.svelte';
	import { forumTopicUrl, type DiscourseTopic } from '$lib/api/discourse';

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

	function toggleExpand(id: number) {
		// Expanding alone does not mark-read. The user has to click the forum
		// CTA below for the red dot to clear, matching the Top Heroes pattern.
		expandedId = expandedId === id ? null : id;
	}

	function openOnForum(e: MouseEvent, topic: DiscourseTopic) {
		// iOS standalone PWAs ignore `target="_blank"` and navigate in-place.
		// Force a new tab via window.open + preventDefault so forum trips
		// always leave sunnylink intact. Middle-click fires `auxclick` (not
		// `click`), so this path only runs for primary-button activation.
		e.preventDefault();
		whatsNewStore.markRead(topic.id);
		window.open(forumTopicUrl(topic), '_blank', 'noopener,noreferrer');
	}

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
		return topic.excerpt.replace(/&hellip;\s*$/i, '…').replace(/\s+$/g, '');
	}

	function coverUrl(topic: DiscourseTopic): string | null {
		return topic.image_url || null;
	}
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
				{@const excerpt = topicExcerpt(topic)}
				<li data-topic-id={topic.id}>
					<article
						class="overflow-hidden rounded-xl border bg-[var(--sl-bg-surface)] transition-colors {isOpen
							? 'border-primary/40'
							: 'border-[var(--sl-border)]'}"
					>
						<button
							type="button"
							onclick={() => toggleExpand(topic.id)}
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
							<div class="flex min-w-0 flex-1 flex-col gap-1">
								<div class="flex items-start gap-2">
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
								<p class="text-[0.75rem] text-[var(--sl-text-3)]">
									{formatDate(topic.created_at)}
								</p>
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
								{#if excerpt}
									<p class="text-[0.875rem] leading-relaxed text-[var(--sl-text-2)]">
										{excerpt}
									</p>
								{:else}
									<p class="text-[0.8125rem] text-[var(--sl-text-3)]">
										No preview available — read the full post on the community forum.
									</p>
								{/if}
								<a
									href={forumTopicUrl(topic)}
									target="_blank"
									rel="noopener noreferrer"
									onclick={(e) => openOnForum(e, topic)}
									class="relative mt-4 inline-flex h-9 items-center justify-center gap-1.5 rounded-lg border border-[var(--sl-border)] bg-[var(--sl-bg-elevated)]/60 px-3.5 text-[0.8125rem] font-medium text-[var(--sl-text-2)] transition-colors hover:bg-[var(--sl-bg-elevated)] hover:text-[var(--sl-text-1)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary active:scale-[0.98]"
								>
									<span>Read on forum</span>
									<ExternalLink size={12} aria-hidden="true" />
									{#if isUnread}
										<span
											class="absolute -top-1 -right-1 inline-flex h-2.5 w-2.5 rounded-full bg-red-500 ring-2 ring-[var(--sl-bg-surface)]"
											aria-label="Unread announcement"
										></span>
									{/if}
								</a>
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
