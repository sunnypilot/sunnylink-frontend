<script lang="ts">
	import { onMount } from 'svelte';
	import { slide } from 'svelte/transition';
	import { afterNavigate, goto } from '$app/navigation';
	import { toast } from 'svelte-sonner';
	import {
		Check,
		ChevronDown,
		ExternalLink,
		Loader2,
		Mail,
		MailOpen,
		Pin,
		X
	} from 'lucide-svelte';
	import { whatsNewStore } from '$lib/stores/whatsNew.svelte';
	import { forumTopicUrl, type DiscourseTopic } from '$lib/api/discourse';

	let expandedId = $state<number | null>(null);
	let sentinelEl = $state<HTMLDivElement | null>(null);

	// Selection mode
	let selectMode = $state(false);
	let selectedIds = $state<Set<number>>(new Set());
	const selectedCount = $derived(selectedIds.size);
	const selectedUnreadCount = $derived(
		[...selectedIds].reduce((n, id) => n + (whatsNewStore.isUnread(id) ? 1 : 0), 0)
	);
	const selectedReadCount = $derived(selectedCount - selectedUnreadCount);
	const allSelectedRead = $derived(selectedCount > 0 && selectedUnreadCount === 0);
	const allSelectedUnread = $derived(selectedCount > 0 && selectedReadCount === 0);

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
		if (selectMode) {
			toggleSelect(id);
			return;
		}
		goto(`/dashboard/whats-new/${id}`);
	}

	function toggleSelect(id: number) {
		const next = new Set(selectedIds);
		if (next.has(id)) next.delete(id);
		else next.add(id);
		selectedIds = next;
	}

	function enterSelectMode() {
		selectMode = true;
		expandedId = null;
	}

	function exitSelectMode() {
		selectMode = false;
		selectedIds = new Set();
	}

	function selectAll() {
		selectedIds = new Set(whatsNewStore.topics.map((t) => t.id));
	}

	type PriorState = { id: number; wasUnread: boolean };

	function snapshotSelection(): PriorState[] {
		return [...selectedIds].map((id) => ({ id, wasUnread: whatsNewStore.isUnread(id) }));
	}

	function bulkMarkRead() {
		const prior = snapshotSelection();
		const ids = prior.map((p) => p.id);
		whatsNewStore.markReadMany(ids);
		const count = ids.length;
		exitSelectMode();
		toast.success(`${count} marked as read`, {
			duration: 5000,
			action: {
				label: 'Undo',
				onClick: () => {
					const restore = prior.filter((p) => p.wasUnread).map((p) => p.id);
					if (restore.length > 0) whatsNewStore.markUnreadMany(restore);
				}
			}
		});
	}

	function bulkMarkUnread() {
		const prior = snapshotSelection();
		const ids = prior.map((p) => p.id);
		whatsNewStore.markUnreadMany(ids);
		const count = ids.length;
		exitSelectMode();
		toast.success(`${count} marked as unread`, {
			duration: 5000,
			action: {
				label: 'Undo',
				onClick: () => {
					const restore = prior.filter((p) => !p.wasUnread).map((p) => p.id);
					if (restore.length > 0) whatsNewStore.markReadMany(restore);
				}
			}
		});
	}

	function openOnForum(e: MouseEvent, topic: DiscourseTopic) {
		e.preventDefault();
		whatsNewStore.markRead(topic.id);
		window.open(forumTopicUrl(topic), '_blank', 'noopener,noreferrer');
	}

	afterNavigate(() => {
		exitSelectMode();
	});

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

	function stripHtml(html: string): string {
		if (typeof document === 'undefined' || !html) return '';
		const tmp = document.createElement('div');
		tmp.innerHTML = html;
		// Collapse whitespace so the 3-line clamp doesn't get tricked by
		// block-level newlines into showing half a line of content.
		return (tmp.textContent || '').replace(/\s+/g, ' ').trim();
	}

	function expandedPreview(topic: DiscourseTopic): string {
		const body = whatsNewStore.bodies[topic.id]?.cooked;
		if (body) return stripHtml(body);
		return topicExcerpt(topic);
	}

	function coverUrl(topic: DiscourseTopic): string | null {
		return topic.image_url || null;
	}
</script>

<svelte:head>
	<title>sunnylink - What's new</title>
</svelte:head>

<div class="mx-auto w-full max-w-3xl {selectMode && selectedCount > 0 ? 'pb-24' : ''}">
	<div class="mb-6 flex items-start justify-between gap-3 px-4 sm:px-0">
		<div class="min-w-0">
			<h2 class="text-[24px] leading-[32px] font-medium tracking-[-0.16px] text-[var(--sl-text-1)]">
				What's new
			</h2>
			<p class="mt-1 text-[0.8125rem] font-[450] text-[var(--sl-text-2)]">
				Latest announcements from the sunnypilot team
			</p>
		</div>
		{#if whatsNewStore.topics.length > 0}
			{#if selectMode}
				<button
					type="button"
					onclick={exitSelectMode}
					class="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-[var(--sl-border)] bg-[var(--sl-bg-surface)] px-3 py-2 text-[0.75rem] font-medium text-[var(--sl-text-2)] transition-all duration-100 hover:bg-[var(--sl-bg-elevated)] hover:text-[var(--sl-text-1)] focus-visible:outline-2 focus-visible:outline-primary active:scale-[0.97]"
				>
					Cancel
				</button>
			{:else}
				<button
					type="button"
					onclick={enterSelectMode}
					class="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-[var(--sl-border)] bg-[var(--sl-bg-surface)] px-3 py-2 text-[0.75rem] font-medium text-[var(--sl-text-2)] transition-all duration-100 hover:bg-[var(--sl-bg-elevated)] hover:text-[var(--sl-text-1)] focus-visible:outline-2 focus-visible:outline-primary active:scale-[0.97]"
				>
					Select
				</button>
			{/if}
		{/if}
	</div>

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
				{@const isOpen = !selectMode && expandedId === topic.id}
				{@const isUnread = whatsNewStore.isUnread(topic.id)}
				{@const isSelected = selectedIds.has(topic.id)}
				{@const cover = coverUrl(topic)}
				{@const preview = expandedPreview(topic)}
				{@const bodyLoading = whatsNewStore.bodyLoading[topic.id]}
				<li data-topic-id={topic.id}>
					<article
						class="relative overflow-hidden rounded-xl border bg-[var(--sl-bg-surface)] transition-colors {isSelected
							? 'border-primary/60 ring-1 ring-primary/30'
							: isOpen
								? 'border-primary/40'
								: 'border-[var(--sl-border)]'}"
					>
						{#if isUnread && !selectMode}
							<span
								class="pointer-events-none absolute top-2.5 right-2.5 z-10 h-2.5 w-2.5 rounded-full bg-red-500 ring-2 ring-[var(--sl-bg-surface)]"
								aria-label="Unread"
							></span>
						{/if}
						<button
							type="button"
							onclick={() => toggleExpand(topic.id)}
							class="flex min-h-[96px] w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-[var(--sl-bg-elevated)]/40 sm:min-h-[112px]"
							aria-expanded={isOpen}
							aria-pressed={selectMode ? isSelected : undefined}
						>
							{#if selectMode}
								<span
									class="flex h-5 w-5 shrink-0 items-center justify-center rounded-md border transition-colors {isSelected
										? 'border-primary bg-primary text-white'
										: 'border-[var(--sl-border)] bg-[var(--sl-bg-page)]'}"
									aria-hidden="true"
								>
									{#if isSelected}
										<Check size={12} strokeWidth={3} />
									{/if}
								</span>
							{/if}
							{#if cover}
								<div
									class="relative h-16 w-24 shrink-0 self-center overflow-hidden rounded-lg bg-[var(--sl-bg-elevated)] sm:h-20 sm:w-32"
								>
									<img src={cover} alt="" loading="lazy" class="h-full w-full object-cover" />
								</div>
							{/if}
							<div class="flex min-w-0 flex-1 flex-col justify-center gap-1">
								<div class="flex items-start gap-2">
									{#if topic.pinned}
										<Pin
											size={12}
											class="mt-1 shrink-0 text-[var(--sl-text-3)]"
											aria-label="Pinned"
										/>
									{/if}
									<h3
										class="line-clamp-3 text-[0.9375rem] leading-snug {isUnread
											? 'font-semibold text-[var(--sl-text-1)]'
											: 'font-medium text-[var(--sl-text-2)]'}"
									>
										{topic.title}
									</h3>
								</div>
								<p class="text-[0.75rem] text-[var(--sl-text-3)]">
									{formatDate(topic.created_at)}
								</p>
							</div>
							{#if !selectMode}
								<ChevronDown
									size={16}
									class="shrink-0 self-center text-[var(--sl-text-3)] transition-transform duration-150 {isOpen
										? 'rotate-180'
										: ''}"
									aria-hidden="true"
								/>
							{/if}
						</button>

						{#if isOpen}
							<div
								class="border-t border-[var(--sl-border-muted)] px-4 py-4"
								transition:slide={{ duration: 180 }}
							>
								{#if bodyLoading && !preview}
									<div class="flex items-center gap-2 text-[var(--sl-text-3)]">
										<Loader2 size={14} class="animate-spin" aria-hidden="true" />
										<span class="text-[0.8125rem]">Loading…</span>
									</div>
								{:else if preview}
									<p class="line-clamp-3 text-[0.875rem] leading-relaxed text-[var(--sl-text-2)]">
										{preview}
									</p>
								{:else}
									<p class="text-[0.8125rem] text-[var(--sl-text-3)]">
										No preview available — read the full post on the community forum.
									</p>
								{/if}
								<div class="mt-4 flex justify-end">
									<a
										href={forumTopicUrl(topic)}
										target="_blank"
										rel="noopener noreferrer"
										onclick={(e) => openOnForum(e, topic)}
										class="relative inline-flex h-9 items-center justify-center gap-1.5 rounded-lg border border-[var(--sl-border)] bg-[var(--sl-bg-elevated)]/60 px-3.5 text-[0.8125rem] font-medium text-[var(--sl-text-2)] transition-colors hover:bg-[var(--sl-bg-elevated)] hover:text-[var(--sl-text-1)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary active:scale-[0.98]"
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

{#if selectMode && selectedCount > 0}
	<div
		class="fixed inset-x-0 bottom-0 z-40 border-t border-[var(--sl-border)] bg-[var(--sl-bg-surface)] shadow-lg"
		style="padding-bottom: env(safe-area-inset-bottom);"
		transition:slide={{ duration: 150 }}
	>
		<div class="mx-auto flex w-full max-w-3xl items-center gap-2 px-4 py-3 sm:gap-3">
			<button
				type="button"
				onclick={exitSelectMode}
				class="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-[var(--sl-text-3)] transition-colors hover:bg-[var(--sl-bg-elevated)] hover:text-[var(--sl-text-1)] focus-visible:outline-2 focus-visible:outline-primary active:scale-[0.92]"
				aria-label="Cancel selection"
			>
				<X size={16} aria-hidden="true" />
			</button>
			<div class="flex min-w-0 flex-col">
				<span class="text-[0.8125rem] font-medium text-[var(--sl-text-1)]">
					{selectedCount} selected
				</span>
				{#if selectedUnreadCount > 0 && selectedReadCount > 0}
					<span class="text-[0.6875rem] text-[var(--sl-text-3)]">
						{selectedUnreadCount} unread · {selectedReadCount} read
					</span>
				{/if}
			</div>
			<button
				type="button"
				onclick={selectAll}
				disabled={selectedCount === whatsNewStore.topics.length}
				class="ml-1 inline-flex h-9 items-center rounded-lg px-2.5 text-[0.75rem] font-medium text-[var(--sl-text-3)] transition-colors hover:text-[var(--sl-text-1)] focus-visible:outline-2 focus-visible:outline-primary disabled:cursor-not-allowed disabled:opacity-40"
			>
				Select all
			</button>
			<div class="ml-auto flex items-center gap-2">
				<button
					type="button"
					onclick={bulkMarkRead}
					disabled={allSelectedRead}
					title={`Sets all ${selectedCount} to read`}
					class="inline-flex h-9 items-center gap-1.5 rounded-lg border border-[var(--sl-border)] bg-[var(--sl-bg-elevated)]/60 px-3 text-[0.8125rem] font-medium text-[var(--sl-text-2)] transition-colors hover:bg-[var(--sl-bg-elevated)] hover:text-[var(--sl-text-1)] focus-visible:outline-2 focus-visible:outline-primary active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-40"
				>
					<MailOpen size={13} aria-hidden="true" />
					<span class="hidden sm:inline">Mark as read</span>
					<span class="sm:hidden">Read</span>
				</button>
				<button
					type="button"
					onclick={bulkMarkUnread}
					disabled={allSelectedUnread}
					title={`Sets all ${selectedCount} to unread`}
					class="inline-flex h-9 items-center gap-1.5 rounded-lg border border-[var(--sl-border)] bg-[var(--sl-bg-elevated)]/60 px-3 text-[0.8125rem] font-medium text-[var(--sl-text-2)] transition-colors hover:bg-[var(--sl-bg-elevated)] hover:text-[var(--sl-text-1)] focus-visible:outline-2 focus-visible:outline-primary active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-40"
				>
					<Mail size={13} aria-hidden="true" />
					<span class="hidden sm:inline">Mark as unread</span>
					<span class="sm:hidden">Unread</span>
				</button>
			</div>
		</div>
	</div>
{/if}
