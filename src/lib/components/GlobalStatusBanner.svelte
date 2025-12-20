<script lang="ts">
	import { onMount } from 'svelte';
	import { fade, slide } from 'svelte/transition';
	import { AlertCircle, AlertTriangle, ExternalLink, Info, X } from 'lucide-svelte';
	// TEST: Import mock data for local testing
	// import { mockIssues, mockFetchComments } from './GlobalStatusBanner.test-data';

	const GITHUB_ISSUES_URL = 'https://api.github.com/repos/sunnypilot/status-page/issues?state=all&labels=sunnylink';

	type StatusLevel = 'info' | 'warning' | 'error' | 'success';

	interface StatusData {
		active: boolean;
		message: string;
		level: StatusLevel;
		link?: string;
		linkText?: string;
		id: string; // ID is required for lists
		timestamp: string; // For accurate sorting
		priority: number; // For sorting
		dismissible?: boolean;
	}

	interface GitHubLabel {
		name: string;
	}

	interface GitHubIssue {
		id: number;
		number: number;
		title: string;
		body: string;
		state: 'open' | 'closed';
		created_at: string;
		updated_at: string;
		closed_at?: string | null;
		labels: GitHubLabel[];
		html_url: string;
		comments_url: string;
	}

	interface GitHubComment {
		id: number;
		body: string;
		created_at: string;
		updated_at: string;
		html_url: string;
	}

	let statuses = $state<StatusData[]>([]);
	let visibleStatuses = $state<StatusData[]>([]);
	const CACHE_KEY = 'sunnylink_global_status_cache';
	const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

	onMount(async () => {
		try {
			// TEST: Uncomment to test locally without hitting GitHub API
			// import { mockIssues, mockFetchComments } from './GlobalStatusBanner.test-data';
			/*
			statuses = await fetchStatuses(mockIssues, mockFetchComments);
			checkDismissals();
			return;
			*/

			// TEST: Test with a specific REAL GitHub Issue (fetches live data for one issue)
			/*
			const TEST_REAL_ISSUE_NUMBER = 15; // Set your issue number here
			const realRes = await fetch(`https://api.github.com/repos/sunnypilot/status-page/issues/${TEST_REAL_ISSUE_NUMBER}`);
			if (realRes.ok) {
				const realIssue = await realRes.json();
				// We pass this real issue to our processor. 
				// It will use the REAL fetchAllComments (since we don't pass an override) to get comments.
				statuses = await fetchStatuses([realIssue]); 
				checkDismissals();
				return;
			}
			*/

			// Check Cache
			const cached = getCache();
			if (cached) {
				statuses = cached;
				checkDismissals();
				return;
			}

			const response = await fetch(GITHUB_ISSUES_URL);
			if (response.ok) {
				const issues: GitHubIssue[] = await response.json();
				statuses = await fetchStatuses(issues);
				setCache(statuses);
				checkDismissals();
			}
		} catch (error) {
			console.error('Failed to fetch global status:', error);
		}
	});

	function getCache(): StatusData[] | null {
		try {
			const stored = localStorage.getItem(CACHE_KEY);
			if (stored) {
				const { timestamp, data } = JSON.parse(stored);
				if (Date.now() - timestamp < CACHE_TTL) {
					return data;
				}
			}
		} catch (e) {
			console.error('Failed to load cache', e);
		}
		return null;
	}

	function setCache(data: StatusData[]) {
		try {
			const cacheData = {
				timestamp: Date.now(),
				data
			};
			localStorage.setItem(CACHE_KEY, JSON.stringify(cacheData));
		} catch (e) {
			console.error('Failed to save cache', e);
		}
	}

	async function fetchAllComments(url: string): Promise<GitHubComment[]> {
		let allComments: GitHubComment[] = [];
		let page = 1;
		let hasMore = true;
		
		while (hasMore) {
			try {
				const separator = url.includes('?') ? '&' : '?';
				const fetchUrl = `${url}${separator}per_page=100&page=${page}`;
				const res = await fetch(fetchUrl);
				
				if (!res.ok) break;
				
				const data: GitHubComment[] = await res.json();
				if (Array.isArray(data) && data.length > 0) {
					allComments = allComments.concat(data);
					// If we got fewer results than per_page, we've reached the end
					if (data.length < 100) {
						hasMore = false;
					} else {
						page++;
					}
				} else {
					hasMore = false;
				}
				
				// Safety break to prevent infinite loops in weird API states
				if (page > 10) hasMore = false; 
			} catch (e) {
				console.error('Error fetching comments page', page, e);
				break;
			}
		}
		
		return allComments;
	}

	async function fetchStatuses(issues: GitHubIssue[], fetchCommentsOverride?: (url: string) => Promise<GitHubComment[]>): Promise<StatusData[]> {
		const validStatuses: StatusData[] = [];
		const now = new Date();

		for (const issue of issues) {
			const labels = issue.labels.map(l => l.name);

			if (!labels.includes('sunnylink')) continue;

			let level: StatusLevel | null = null;
			let priority = -1;

			if (labels.includes('status')) {
				level = 'error';
				priority = 2; // Error supersedes all
			} else if (labels.includes('maintenance')) {
				level = 'warning';
				priority = 1; // Warning supersedes info
			} else if (labels.includes('info')) {
				level = 'info';
				priority = 0;
			}

			if (level) {
				// State Logic check
				let show = false;

				if (level === 'error' || level === 'warning') {
					// Error/Warning: Only show if open
					if (issue.state === 'open') {
						show = true;
					}
				} else if (level === 'info') {
					// Info: Show if open OR (closed AND closed < 24h ago)
					if (issue.state === 'open') {
						show = true;
					} else if (issue.state === 'closed' && issue.closed_at) {
						const closedDate = new Date(issue.closed_at);
						const diffHours = (now.getTime() - closedDate.getTime()) / (1000 * 60 * 60);
						if (diffHours < 24) {
							show = true;
						}
					}
				}

				if (show) {
					// Fetch comments to find the latest update
					let comments: GitHubComment[] = [];
					try {
						if (fetchCommentsOverride) {
							comments = await fetchCommentsOverride(issue.comments_url);
						} else {
							comments = await fetchAllComments(issue.comments_url);
						}
					} catch (e) {
						console.error('Failed to fetch comments for issue', issue.number, e);
					}

					// Combine Issue Body and Comments
					const updates = [
						{ body: issue.body, timestamp: issue.updated_at || issue.created_at, source: 'body' },
						...comments.map(c => ({ body: c.body, timestamp: c.updated_at || c.created_at, source: 'comment' }))
					];

					// Find all matches
					const matches: { message: string; timestamp: string }[] = [];
					for (const update of updates) {
						const match = update.body.match(/\[Public Notification\]:\s*(.+)/);
						if (match && match[1]) {
							matches.push({
								message: match[1].trim(),
								timestamp: update.timestamp
							});
						}
					}

					// Sort by timestamp DESC (newest/most recently updated first)
					matches.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

					const latest = matches[0];
					if (latest) {
						// Dismissibility: Warning and Info are dismissible. Error is NOT.
						const isDismissible = (level !== 'error');

						validStatuses.push({
							active: true,
							message: latest.message,
							level: level,
							link: level === 'info' ? undefined : `https://status.sunnypilot.ai/incident/${issue.number}`,
							linkText: 'View Status',
							id: `${issue.number}-${latest.timestamp}`, // Use compound ID to prevent collisions
							timestamp: latest.timestamp, // Store raw timestamp for valid sorting
							priority: priority,
							dismissible: isDismissible
						});
					}
				}
			}
		}

		// Sort: Priority DESC (Error -> Warning -> Info), then Date DESC (Newest first)
		return validStatuses.sort((a, b) => {
			if (b.priority !== a.priority) {
				return b.priority - a.priority;
			}
			return new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime();
		});
	}

	function checkDismissals() {
		// Read dismissed IDs from localStorage
		let dismissedIds: string[] = [];
		try {
			const stored = localStorage.getItem('sunnylink_dismissed_status_ids');
			if (stored) {
				dismissedIds = JSON.parse(stored);
				if (!Array.isArray(dismissedIds)) dismissedIds = [];
			}
		} catch (e) {
			dismissedIds = [];
		}

		visibleStatuses = statuses.filter(s => {
			// If not dismissible, always show
			if (!s.dismissible) return true;
			// If dismissible, show only if ID is not in dismissed list
			return !dismissedIds.includes(s.id);
		});
	}

	function dismiss(id: string) {
		// Update visible list locally first for responsiveness
		visibleStatuses = visibleStatuses.filter(s => s.id !== id);

		// Persist dismissal
		try {
			let dismissedIds: string[] = [];
			const stored = localStorage.getItem('sunnylink_dismissed_status_ids');
			if (stored) {
				dismissedIds = JSON.parse(stored);
				if (!Array.isArray(dismissedIds)) dismissedIds = [];
			}
			if (!dismissedIds.includes(id)) {
				dismissedIds.push(id);
				localStorage.setItem('sunnylink_dismissed_status_ids', JSON.stringify(dismissedIds));
			}
		} catch (e) {
			console.error('Failed to save dismissal', e);
		}
	}

	const styles = {
		info: 'bg-blue-500/10 border-blue-500/20 text-blue-200',
		warning: 'bg-amber-500/10 border-amber-500/20 text-amber-200',
		error: 'bg-amber-500/10 border-amber-500/20 text-amber-200',
		success: 'bg-green-500/10 border-green-500/20 text-green-200'
	};

	const icons = {
		info: Info,
		warning: AlertTriangle,
		error: AlertCircle,
		success: Info
	};
</script>

{#if visibleStatuses.length > 0}
	<div class="flex flex-col w-full z-[60] relative">
		{#each visibleStatuses as status (status.id)}
			<div
				transition:slide={{ duration: 300 }}
				class="w-full border-b backdrop-blur-md {styles[status.level] || styles.info} first:pt-[env(safe-area-inset-top)]"
			>
				<div class="mx-auto flex max-w-7xl items-start justify-between gap-4 p-4 sm:items-center sm:px-6 lg:px-8">
					<div class="flex flex-1 items-start gap-3 sm:items-center">
						{#key status.level}
							{@const Icon = icons[status.level] || Info}
							<Icon class="mt-0.5 h-5 w-5 shrink-0 sm:mt-0" />
						{/key}

						<div class="flex flex-col gap-1 sm:flex-row sm:items-center sm:gap-3">
							<p class="font-medium">{status.message}</p>

							{#if status.link}
								<a
									href={status.link}
									target="_blank"
									rel="noreferrer"
									class="flex w-fit items-center gap-1 rounded text-xs font-semibold underline underline-offset-2 opacity-90 transition-opacity hover:opacity-100 sm:text-sm"
								>
									{status.linkText || 'Learn more'}
									<ExternalLink size={12} />
								</a>
							{/if}
						</div>
					</div>

					{#if status.dismissible}
						<button
							onclick={() => dismiss(status.id)}
							class="-mr-2 rounded-lg p-2 opacity-60 hover:bg-white/10 hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-white/20"
							aria-label="Dismiss"
						>
							<X size={18} />
						</button>
					{/if}
				</div>
			</div>
		{/each}
	</div>
{/if}
