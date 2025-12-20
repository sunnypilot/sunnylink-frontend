<script lang="ts">
	import { onMount } from 'svelte';
	import { fade, slide } from 'svelte/transition';
	import { AlertCircle, AlertTriangle, ExternalLink, Info, X } from 'lucide-svelte';

	// TODO: Replace this with the actual URL where the status JSON is hosted
	const STATUS_URL = 'https://sunnylink-frontend.s3.us-east-1.amazonaws.com/status/status.json';

	type StatusLevel = 'info' | 'warning' | 'error' | 'success';

	interface StatusData {
		active: boolean;
		message: string;
		level: StatusLevel;
		link?: string;
		linkText?: string;
		id?: string; // Optional ID for dismissal persistence
	}

	let status = $state<StatusData | null>(null);
	let visible = $state(false);
	let dismissed = $state(false);

	onMount(async () => {
		try {
			// For testing purposes, uncomment this to simulate a banner
			/*
			status = {
				active: true,
				message: 'sunnylink is currently experiencing intermittent issues. We are investigating.',
				level: 'warning',
				link: 'https://status.sunnypilot.ai',
				linkText: 'Status Page',
				id: 'incident-2023-12-19'
			};
			checkDismissal();
			return;
			*/

			const response = await fetch(STATUS_URL);
			if (response.ok) {
				const data = await response.json();
				if (data && data.active) {
					status = data;
					checkDismissal();
				}
			}
		} catch (error) {
			console.error('Failed to fetch global status:', error);
		}
	});

	function checkDismissal() {
		if (status?.id) {
			const dismissedId = localStorage.getItem('sunnylink_dismissed_status_id');
			if (dismissedId === status.id) {
				dismissed = true;
			}
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

			<button
				onclick={dismiss}
				class="-mr-2 rounded-lg p-2 opacity-60 hover:bg-white/10 hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-white/20"
				aria-label="Dismiss"
			>
				<X size={18} />
			</button>
		</div>
	</div>
{/if}
