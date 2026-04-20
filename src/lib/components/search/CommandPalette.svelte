<script lang="ts">
	import { Search, X, CornerDownLeft, ArrowUp, ArrowDown, Clock, Sparkles } from 'lucide-svelte';
	import { fade, fly } from 'svelte/transition';
	import { cubicOut } from 'svelte/easing';
	import { deviceState } from '$lib/stores/device.svelte';
	import { searchState } from '$lib/stores/search.svelte';
	import { getAllSettings } from '$lib/utils/settings';
	import { searchSettings, type SearchResult } from '$lib/utils/search';
	import { MODEL_SETTINGS } from '$lib/types/settings';
	import { modalLock } from '$lib/utils/modalLock';
	import { goto } from '$app/navigation';
	import type { FuseResultMatch } from 'fuse.js';

	const SUGGESTED_QUERIES = ['Cruise', 'Lateral', 'Experimental', 'MADS', 'Models'];

	let inputRef: HTMLInputElement | undefined = $state();
	let listRef: HTMLElement | undefined = $state();
	let dialogRef: HTMLElement | undefined = $state();
	let activeIdx = $state(0);
	let previouslyFocused: HTMLElement | null = null;

	let deviceId = $derived(deviceState.selectedDeviceId);
	let settings = $derived(deviceId ? deviceState.deviceSettings[deviceId] : undefined);
	let searchable = $derived(
		getAllSettings(settings, true, false).filter(
			(s) => !s.hidden || MODEL_SETTINGS.includes(s.key)
		)
	);
	let deviceValues = $derived(deviceId ? deviceState.deviceValues[deviceId] : undefined);

	const MIN_QUERY_LENGTH = 3;

	let results: SearchResult[] = $derived.by(() => {
		const q = searchState.query.trim();
		if (q.length < MIN_QUERY_LENGTH) return [];
		return searchSettings(q, searchable, deviceValues).slice(0, 20);
	});

	$effect(() => {
		// Reset highlight when result set changes size.
		results.length;
		activeIdx = 0;
	});

	$effect(() => {
		if (searchState.isOpen) {
			previouslyFocused = (document.activeElement as HTMLElement) ?? null;
			queueMicrotask(() => inputRef?.focus());
		} else {
			previouslyFocused?.focus?.();
			searchState.clear();
			activeIdx = 0;
		}
	});

	let reducedMotion = $state(false);
	if (typeof window !== 'undefined') {
		const mql = window.matchMedia('(prefers-reduced-motion: reduce)');
		reducedMotion = mql.matches;
		$effect(() => {
			const h = (e: MediaQueryListEvent) => (reducedMotion = e.matches);
			mql.addEventListener('change', h);
			return () => mql.removeEventListener('change', h);
		});
	}

	// Mobile keyboard squishes the visual viewport but `100dvh` doesn't
	// always react on iOS, so the list ends up extending behind the keyboard
	// with the bottom rows unreachable. Track `visualViewport.height` and
	// pin the container to it so results stay scrollable above the keyboard —
	// same pattern as Linear/Slack command bars.
	let viewportHeight = $state<number | null>(null);
	$effect(() => {
		if (!searchState.isOpen || typeof window === 'undefined') return;
		const vv = window.visualViewport;
		if (!vv) return;
		const update = () => (viewportHeight = vv.height);
		update();
		vv.addEventListener('resize', update);
		vv.addEventListener('scroll', update);
		return () => {
			vv.removeEventListener('resize', update);
			vv.removeEventListener('scroll', update);
			viewportHeight = null;
		};
	});

	function handleSelect(result: SearchResult) {
		const { setting } = result;
		searchState.pushHistory(searchState.query);
		searchState.close();
		if (MODEL_SETTINGS.includes(setting.key)) {
			goto(`/dashboard/models#${setting.key}`);
		} else {
			goto(`/dashboard/settings/${setting.category}#${setting.key}`);
		}
	}

	function handleSuggested(q: string) {
		searchState.query = q;
		inputRef?.focus();
	}

	function handleKeydown(e: KeyboardEvent) {
		// Global hotkey: Cmd/Ctrl+K toggles. `/` opens when no text field has focus
		// (matches GitHub, Notion, Linear behavior). Registered here (always mounted)
		// rather than on SearchTrigger, which renders twice (desktop + mobile) and
		// would double-fire toggle().
		if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
			e.preventDefault();
			searchState.toggle();
			return;
		}
		if (e.key === '/' && !searchState.isOpen) {
			const el = document.activeElement as HTMLElement | null;
			const tag = el?.tagName;
			if (tag === 'INPUT' || tag === 'TEXTAREA' || el?.isContentEditable) return;
			e.preventDefault();
			searchState.open();
			return;
		}
		if (!searchState.isOpen) return;
		switch (e.key) {
			case 'Escape':
				e.preventDefault();
				searchState.close();
				break;
			case 'ArrowDown':
				if (results.length > 0) {
					e.preventDefault();
					activeIdx = (activeIdx + 1) % results.length;
					scrollActiveIntoView();
				}
				break;
			case 'ArrowUp':
				if (results.length > 0) {
					e.preventDefault();
					activeIdx = (activeIdx - 1 + results.length) % results.length;
					scrollActiveIntoView();
				}
				break;
			case 'Enter': {
				const r = results[activeIdx];
				if (r) {
					e.preventDefault();
					handleSelect(r);
				}
				break;
			}
		}
	}

	function scrollActiveIntoView() {
		queueMicrotask(() => {
			const el = listRef?.querySelector(
				`[data-result-idx="${activeIdx}"]`
			) as HTMLElement | null;
			el?.scrollIntoView({ block: 'nearest' });
		});
	}

	function handleTab(e: KeyboardEvent) {
		if (e.key !== 'Tab' || !dialogRef) return;
		const focusables = dialogRef.querySelectorAll<HTMLElement>(
			'button, input, [tabindex]:not([tabindex="-1"])'
		);
		if (focusables.length === 0) return;
		const first = focusables[0]!;
		const last = focusables[focusables.length - 1]!;
		if (e.shiftKey && document.activeElement === first) {
			e.preventDefault();
			last.focus();
		} else if (!e.shiftKey && document.activeElement === last) {
			e.preventDefault();
			first.focus();
		}
	}

	function escapeHtml(s: string): string {
		return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
	}

	function highlight(
		text: string,
		key: string,
		matches: readonly FuseResultMatch[] | undefined
	): string {
		if (!matches) return escapeHtml(text);
		const m = matches.find((mm) => mm.key === key);
		if (!m) return escapeHtml(text);
		let html = '';
		let cursor = 0;
		for (const [start, end] of m.indices) {
			if (start >= cursor) {
				html += escapeHtml(text.slice(cursor, start));
				html += `<mark class="rounded-sm bg-primary/20 px-[1px] text-[var(--sl-text-1)]">${escapeHtml(text.slice(start, end + 1))}</mark>`;
				cursor = end + 1;
			}
		}
		html += escapeHtml(text.slice(cursor));
		return html;
	}

	function categoryLabel(r: SearchResult): string {
		return MODEL_SETTINGS.includes(r.setting.key) ? 'models' : r.setting.category;
	}

	function titleOf(r: SearchResult): string {
		return r.setting._extra?.title || r.setting.label;
	}

	function descOf(r: SearchResult): string {
		return r.setting._extra?.description || r.setting.description;
	}
</script>

<svelte:window onkeydown={handleKeydown} />

{#if searchState.isOpen}
	<!-- svelte-ignore a11y_click_events_have_key_events -->
	<!-- svelte-ignore a11y_no_static_element_interactions -->
	<div
		class="fixed inset-0 z-[60] bg-black/50 backdrop-blur-sm"
		onclick={() => searchState.close()}
		transition:fade={{ duration: reducedMotion ? 0 : 150 }}
		aria-hidden="true"
		use:modalLock
	></div>

	<div
		bind:this={dialogRef}
		class="fixed inset-x-0 top-0 z-[70] mx-auto w-full max-w-xl md:top-[12vh] md:px-4"
		role="dialog"
		aria-modal="true"
		aria-label="Search settings"
		tabindex="-1"
		onkeydown={handleTab}
		transition:fly={{
			y: reducedMotion ? 0 : -8,
			duration: reducedMotion ? 0 : 200,
			easing: cubicOut
		}}
	>
		<div
			class="flex h-[var(--cp-h,100dvh)] flex-col overflow-hidden bg-[var(--sl-bg-surface)] shadow-2xl md:h-auto md:max-h-[70vh] md:rounded-xl md:border md:border-[var(--sl-border)]"
			style="--cp-h: {viewportHeight !== null ? `${viewportHeight}px` : '100dvh'}"
		>
			<div class="flex items-center gap-3 border-b border-[var(--sl-border)] px-4 py-3">
				<Search class="h-4 w-4 shrink-0 text-[var(--sl-text-3)]" aria-hidden="true" />
				<input
					bind:this={inputRef}
					type="text"
					bind:value={searchState.query}
					placeholder="Search settings…"
					autocomplete="off"
					autocapitalize="off"
					autocorrect="off"
					spellcheck="false"
					class="min-w-0 flex-1 bg-transparent text-[16px] text-[var(--sl-text-1)] placeholder-[var(--sl-text-3)] focus:outline-none md:text-[0.9375rem]"
					role="combobox"
					aria-expanded={results.length > 0}
					aria-controls="command-palette-list"
					aria-activedescendant={results.length > 0 ? `cp-result-${activeIdx}` : undefined}
					aria-autocomplete="list"
				/>
				{#if searchState.query}
					<button
						class="flex h-7 w-7 items-center justify-center rounded-md text-[var(--sl-text-3)] transition-colors hover:bg-[var(--sl-bg-elevated)] hover:text-[var(--sl-text-1)]"
						aria-label="Clear query"
						onclick={() => {
							searchState.clear();
							inputRef?.focus();
						}}
					>
						<X class="h-4 w-4" />
					</button>
				{/if}
				<button
					class="rounded-md border border-[var(--sl-border)] bg-[var(--sl-bg-elevated)] px-1.5 py-0.5 text-[0.6875rem] font-medium text-[var(--sl-text-3)] transition-colors hover:text-[var(--sl-text-1)]"
					aria-label="Close"
					onclick={() => searchState.close()}
				>
					esc
				</button>
			</div>

			<div bind:this={listRef} class="flex-1 overflow-y-auto overscroll-contain">
				{#if searchState.query.trim() && searchState.query.trim().length < MIN_QUERY_LENGTH}
					<div class="px-4 py-10 text-center text-sm text-[var(--sl-text-2)]">
						Keep typing — at least {MIN_QUERY_LENGTH} characters.
					</div>
				{:else if searchState.query.trim() && results.length === 0}
					<div class="px-4 py-10 text-center text-sm text-[var(--sl-text-2)]">
						No settings match "<span class="font-medium text-[var(--sl-text-1)]"
							>{searchState.query}</span
						>".
					</div>
				{:else if searchState.query.trim()}
					<ul
						id="command-palette-list"
						role="listbox"
						class="py-1"
						aria-label="Search results"
					>
						{#each results as result, i (result.setting.key)}
							{@const active = i === activeIdx}
							<li role="option" aria-selected={active}>
								<button
									id="cp-result-{i}"
									data-result-idx={i}
									class="flex w-full flex-col gap-0.5 border-l-2 px-4 py-2.5 text-left transition-colors {active
										? 'border-l-primary bg-[var(--sl-bg-elevated)]'
										: 'border-l-transparent hover:bg-[var(--sl-bg-elevated)]'}"
									onclick={() => handleSelect(result)}
									onmouseenter={() => (activeIdx = i)}
								>
									<span class="flex items-center justify-between gap-3">
										<span
											class="truncate text-[0.875rem] font-medium text-[var(--sl-text-1)]"
										>
											{@html highlight(titleOf(result), 'title', result.matches)}
										</span>
										<span
											class="shrink-0 rounded-md bg-[var(--sl-bg-input)] px-1.5 py-0.5 text-[0.6875rem] font-medium text-[var(--sl-text-3)] capitalize"
										>
											{categoryLabel(result)}
										</span>
									</span>
									{#if result.setting.key !== titleOf(result)}
										<span class="truncate font-mono text-[0.75rem] text-[var(--sl-text-3)]">
											{@html highlight(result.setting.key, 'key', result.matches)}
										</span>
									{/if}
									{#if descOf(result)}
										<span class="line-clamp-2 text-[0.8125rem] text-[var(--sl-text-2)]">
											{@html highlight(descOf(result), 'description', result.matches)}
										</span>
									{/if}
								</button>
							</li>
						{/each}
					</ul>
				{:else}
					<div class="px-4 pt-4 pb-3">
						<div
							class="flex items-center gap-2 text-[0.6875rem] font-semibold tracking-wider text-[var(--sl-text-3)] uppercase"
						>
							<Sparkles class="h-3 w-3" aria-hidden="true" />
							Suggested
						</div>
						<div class="mt-2 flex flex-wrap gap-2">
							{#each SUGGESTED_QUERIES as q}
								<button
									class="rounded-full border border-[var(--sl-border)] bg-[var(--sl-bg-elevated)] px-3 py-1 text-[0.8125rem] text-[var(--sl-text-2)] transition-colors hover:border-[var(--sl-text-3)] hover:text-[var(--sl-text-1)]"
									onclick={() => handleSuggested(q)}
								>
									{q}
								</button>
							{/each}
						</div>
					</div>
					{#if searchState.history.length > 0}
						<div class="border-t border-[var(--sl-border)] px-4 pt-3 pb-4">
							<div class="flex items-center justify-between">
								<div
									class="flex items-center gap-2 text-[0.6875rem] font-semibold tracking-wider text-[var(--sl-text-3)] uppercase"
								>
									<Clock class="h-3 w-3" aria-hidden="true" />
									Recent
								</div>
								<button
									class="text-[0.6875rem] text-[var(--sl-text-3)] hover:text-[var(--sl-text-1)]"
									onclick={() => searchState.clearHistory()}
								>
									Clear
								</button>
							</div>
							<ul class="mt-2 flex flex-col">
								{#each searchState.history as h}
									<li>
										<button
											class="flex w-full items-center gap-3 rounded-md px-2 py-1.5 text-left text-[0.8125rem] text-[var(--sl-text-2)] transition-colors hover:bg-[var(--sl-bg-elevated)] hover:text-[var(--sl-text-1)]"
											onclick={() => handleSuggested(h)}
										>
											<Clock
												class="h-3.5 w-3.5 shrink-0 text-[var(--sl-text-3)]"
												aria-hidden="true"
											/>
											{h}
										</button>
									</li>
								{/each}
							</ul>
						</div>
					{/if}
				{/if}
			</div>

			<div
				class="hidden items-center justify-between border-t border-[var(--sl-border)] bg-[var(--sl-bg-page)] px-4 py-2 text-[0.6875rem] text-[var(--sl-text-3)] md:flex"
			>
				<div class="flex items-center gap-4">
					<span class="flex items-center gap-1">
						<kbd
							class="rounded border border-[var(--sl-border)] bg-[var(--sl-bg-surface)] px-1.5 py-0.5 font-mono"
						>
							<ArrowUp class="inline h-3 w-3" aria-hidden="true" />
						</kbd>
						<kbd
							class="rounded border border-[var(--sl-border)] bg-[var(--sl-bg-surface)] px-1.5 py-0.5 font-mono"
						>
							<ArrowDown class="inline h-3 w-3" aria-hidden="true" />
						</kbd>
						navigate
					</span>
					<span class="flex items-center gap-1">
						<kbd
							class="rounded border border-[var(--sl-border)] bg-[var(--sl-bg-surface)] px-1.5 py-0.5 font-mono"
						>
							<CornerDownLeft class="inline h-3 w-3" aria-hidden="true" />
						</kbd>
						open
					</span>
					<span class="flex items-center gap-1">
						<kbd
							class="rounded border border-[var(--sl-border)] bg-[var(--sl-bg-surface)] px-1.5 py-0.5 font-mono"
							>esc</kbd
						>
						close
					</span>
				</div>
				{#if results.length > 0}
					<span aria-live="polite"
						>{results.length} {results.length === 1 ? 'result' : 'results'}</span
					>
				{/if}
			</div>
		</div>
	</div>
{/if}
