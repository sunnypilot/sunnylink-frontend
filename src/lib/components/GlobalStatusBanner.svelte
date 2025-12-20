<script lang="ts">
	import { onMount } from 'svelte';
	import { fade, slide } from 'svelte/transition';
	import { AlertCircle, AlertTriangle, ExternalLink, Info, X } from 'lucide-svelte';

	const GITHUB_ISSUES_URL = 'https://api.github.com/repos/sunnypilot/status-page/issues?state=open&labels=sunnylink';

	type StatusLevel = 'info' | 'warning' | 'error' | 'success';

	interface StatusData {
		active: boolean;
		message: string;
		level: StatusLevel;
		link?: string;
		linkText?: string;
		id?: string; // Optional ID for dismissal persistence
		dismissible?: boolean; // Defaults to true if undefined
	}

	interface GitHubLabel {
		name: string;
	}

	interface GitHubIssue {
		id: number;
		title: string;
		body: string;
		created_at: string;
		labels: GitHubLabel[];
		html_url: string;
	}

	let status = $state<StatusData | null>(null);
	let visible = $state(false);
	let dismissed = $state(false);

	onMount(async () => {
		try {
			const response = await fetch(GITHUB_ISSUES_URL);
			if (response.ok) {
				const issues: GitHubIssue[] = await response.json();
				
				// Process issues to find the most relevant one
				const activeStatus = processIssues(issues);
				
				if (activeStatus) {
					status = activeStatus;
					checkDismissal();
				}
			}
		} catch (error) {
			console.error('Failed to fetch global status:', error);
		}
	});

	function processIssues(issues: GitHubIssue[]): StatusData | null {
		// Define priority: error > warning > info
		let bestIssue: StatusData | null = null;
		let highestPriority = -1; // 0: info, 1: warning, 2: error

		for (const issue of issues) {
			const labels = issue.labels.map(l => l.name);
			
			// Must have 'sunnylink' (implied by API query but good to verify if we change query later)
			if (!labels.includes('sunnylink')) continue;

			let level: StatusLevel | null = null;
			let priority = -1;

			if (labels.includes('status')) {
				level = 'error';
				priority = 2;
			} else if (labels.includes('maintenance')) {
				level = 'warning';
				priority = 1;
			} else if (labels.includes('into')) {
				level = 'info';
				priority = 0;
			}

			if (level && priority > highestPriority) {
				// Parse message
				const messageMatch = issue.body.match(/\[Public Notification\]:\s*(.+)/);
				
				if (messageMatch && messageMatch[1]) {
					highestPriority = priority;
					
					// Determine dismissibility
					// Not dismissible if 'status' (error) or 'maintenance' (warning)
					const isDismissible = !(level === 'error' || level === 'warning');

					bestIssue = {
						active: true,
						message: messageMatch[1].trim(),
						level: level,
						link: issue.html_url,
						linkText: 'View Status',
						id: issue.created_at, // Using created_at as ID
						dismissible: isDismissible
					};
				}
			}
		}

		return bestIssue;
	}

	function checkDismissal() {
		// Default dismissible to true if not specified
		const isDismissible = status?.dismissible !== false;

		if (isDismissible && status?.id) {
			const dismissedId = localStorage.getItem('sunnylink_dismissed_status_id');
			if (dismissedId === status.id) {
				dismissed = true;
			}
		} else if (!isDismissible) {
			// If not dismissible, it surely can't be dismissed, even if an ID exists in local storage
			dismissed = false;
		}

		if (!dismissed && status?.active) {
			visible = true;
		}
	}

	function dismiss() {
		visible = false;
		if (status?.id) {
			localStorage.setItem('sunnylink_dismissed_status_id', status.id);
		}
	}

	const styles = {
		info: 'bg-blue-500/10 border-blue-500/20 text-blue-200',
		warning: 'bg-amber-500/10 border-amber-500/20 text-amber-200',
		error: 'bg-red-500/10 border-red-500/20 text-red-200',
		success: 'bg-green-500/10 border-green-500/20 text-green-200'
	};

	const icons = {
		info: Info,
		warning: AlertTriangle,
		error: AlertCircle,
		success: Info 
	};
</script>

{#if visible && status}
	<div
		transition:slide={{ duration: 300 }}
		class="relative z-[60] w-full border-b backdrop-blur-md pt-[env(safe-area-inset-top)] {styles[status.level] || styles.info}"
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

			{#if status.dismissible !== false}
				<button
					onclick={dismiss}
					class="-mr-2 rounded-lg p-2 opacity-60 hover:bg-white/10 hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-white/20"
					aria-label="Dismiss"
				>
					<X size={18} />
				</button>
			{/if}
		</div>
	</div>
{/if}
