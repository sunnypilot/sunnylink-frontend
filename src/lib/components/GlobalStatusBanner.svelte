<script lang="ts">
	import { onMount } from 'svelte';
	import { fade, slide } from 'svelte/transition';
	import { AlertCircle, AlertTriangle, ExternalLink, Info, X } from 'lucide-svelte';

	const GITHUB_ISSUES_URL = 'https://api.github.com/repos/sunnypilot/status-page/issues?state=all&labels=sunnylink';

	type StatusLevel = 'info' | 'warning' | 'error' | 'success';

	interface StatusData {
		active: boolean;
		message: string;
		level: StatusLevel;
		link?: string;
		linkText?: string;
		id: string; // ID is required for lists
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
		closed_at?: string | null;
		labels: GitHubLabel[];
		html_url: string;
		comments_url: string;
	}

	interface GitHubComment {
		id: number;
		body: string;
		created_at: string;
		html_url: string;
	}

	let statuses = $state<StatusData[]>([]);
	let visibleStatuses = $state<StatusData[]>([]);

	onMount(async () => {
		try {
			// TEST: Uncomment to test locally without hitting GitHub API
			/*
			const mockIssues: GitHubIssue[] = [
				{
					id: 1,
					number: 101,
					title: 'Active Error',
					body: '[Public Notification]: Initial failure message.',
					state: 'open',
					created_at: new Date(Date.now() - 20000).toISOString(),
					labels: [{ name: 'sunnylink' }, { name: 'status' }],
					html_url: '',
					comments_url: 'mock_comments_1'
				},
				{
					id: 2,
					number: 102,
					title: 'Active Warning',
					body: '[Public Notification]: Degradation detected.',
					state: 'open',
					created_at: new Date(Date.now() - 10000).toISOString(),
					labels: [{ name: 'sunnylink' }, { name: 'maintenance' }],
					html_url: '',
					comments_url: 'mock_comments_2'
				},
				{
					id: 3,
					number: 103,
					title: 'Closed Info (Recent)',
					body: '[Public Notification]: Maintenance complete.',
					state: 'closed',
					created_at: new Date(Date.now() - 100000).toISOString(),
					closed_at: new Date(Date.now() - 3600000).toISOString(), // 1 hour ago
					labels: [{ name: 'sunnylink' }, { name: 'info' }],
					html_url: '',
					comments_url: 'mock_comments_3'
				},
				{
					id: 4,
					number: 104,
					title: 'Closed Warning (Should Hide)',
					body: '[Public Notification]: Should not see this.',
					state: 'closed',
					created_at: new Date().toISOString(),
					closed_at: new Date().toISOString(),
					labels: [{ name: 'sunnylink' }, { name: 'maintenance' }],
					html_url: '',
					comments_url: 'mock_comments_4'
				}
			];

			// Mock function to simulate comment fetch
			const mockFetchComments = async (url: string) => {
				if (url === 'mock_comments_1') {
					return [{
						id: 99,
						body: '[Public Notification]: Updated status failure message from comment.',
						created_at: new Date().toISOString(),
						html_url: ''
					}];
				}
				if (url === 'mock_comments_2') {
					return [{
						id: 100,
						body: '[Public Notification]: Degradation update from comment.',
						created_at: new Date(Date.now() - 5000).toISOString(),
						html_url: ''
					}];
				}
				return [];
			};
			
			// Inject mock fetcher if testing (requires slight code mod to inject, or just rely on API structure)
			statuses = await fetchStatuses(mockIssues, mockFetchComments);
			checkDismissals();
			return;
			*/

			const response = await fetch(GITHUB_ISSUES_URL);
			if (response.ok) {
				const issues: GitHubIssue[] = await response.json();
				statuses = await fetchStatuses(issues);
				checkDismissals();
			}
		} catch (error) {
			console.error('Failed to fetch global status:', error);
		}
	});

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
							const res = await fetch(issue.comments_url);
							if (res.ok) {
								comments = await res.json();
							}
						}
					} catch (e) {
						console.error('Failed to fetch comments for issue', issue.number, e);
					}

					// Combine Issue Body and Comments
					const updates = [
						{ body: issue.body, created_at: issue.created_at, source: 'body' },
						...comments.map(c => ({ body: c.body, created_at: c.created_at, source: 'comment' }))
					];

					// Find all matches
					const matches: { message: string; created_at: string }[] = [];
					for (const update of updates) {
						const match = update.body.match(/\[Public Notification\]:\s*(.+)/);
						if (match && match[1]) {
							matches.push({
								message: match[1].trim(),
								created_at: update.created_at
							});
						}
					}

					// Sort by created_at DESC (newest first)
					matches.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

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
							id: latest.created_at, // Use timestamp of the MESSAGE as unique ID. New message = re-appears.
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
			return new Date(b.id).getTime() - new Date(a.id).getTime();
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
