<script lang="ts">
	interface Props {
		text: string;
		mono?: boolean;
		className?: string;
	}

	let { text, mono = false, className = '' }: Props = $props();

	let containerEl = $state<HTMLElement | undefined>();
	let overflows = $state(false);

	$effect(() => {
		text;
		if (!containerEl) return;
		requestAnimationFrame(() => {
			if (!containerEl) return;
			const track = containerEl.querySelector('.marquee-track');
			const firstSpan = track?.children[0] as HTMLElement | undefined;
			if (!firstSpan) return;
			const textWidth = firstSpan.offsetWidth;
			const containerWidth = containerEl.clientWidth;
			if (textWidth > containerWidth) {
				const gap = 46;
				containerEl.style.setProperty('--marquee-scroll', `-${textWidth + gap}px`);
				containerEl.style.setProperty(
					'--marquee-duration',
					`${Math.max(4, (textWidth + gap) / 30)}s`
				);
				overflows = true;
			} else {
				overflows = false;
			}
		});
	});
</script>

<span bind:this={containerEl} class="marquee-container {className}" class:overflows>
	<span class="marquee-track whitespace-nowrap {mono ? 'font-mono' : ''}">
		<span>{text}</span>
		{#if overflows}
			<span class="marquee-gap" aria-hidden="true"></span>
			<span aria-hidden="true">{text}</span>
		{/if}
	</span>
</span>

<style>
	.marquee-container {
		display: inline-block;
		max-width: 100%;
		overflow: hidden;
		vertical-align: bottom;
	}
	.marquee-container:not(.overflows) {
		white-space: nowrap;
		text-overflow: ellipsis;
	}
	.marquee-container.overflows {
		-webkit-mask-image: linear-gradient(to right, black, black calc(100% - 14px), transparent);
		mask-image: linear-gradient(to right, black, black calc(100% - 14px), transparent);
	}
	.marquee-track {
		display: inline-flex;
		align-items: center;
	}
	.marquee-gap {
		display: inline-block;
		width: 46px;
		flex-shrink: 0;
	}
	.marquee-container.overflows .marquee-track {
		animation: marquee-scroll var(--marquee-duration, 6s) linear 2s infinite;
	}
	@keyframes marquee-scroll {
		0% {
			transform: translateX(0);
		}
		100% {
			transform: translateX(var(--marquee-scroll, 0px));
		}
	}
	@media (prefers-reduced-motion: reduce) {
		.marquee-container.overflows .marquee-track {
			animation: none;
		}
	}
</style>
