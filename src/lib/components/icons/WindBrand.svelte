<script lang="ts">
	interface Props {
		size?: number | string;
		class?: string;
	}
	let { size = 24, class: className = '' }: Props = $props();
</script>

<svg
	xmlns="http://www.w3.org/2000/svg"
	width={size}
	height={size}
	viewBox="0 0 24 24"
	fill="none"
	stroke="currentColor"
	stroke-width="2"
	stroke-linecap="round"
	stroke-linejoin="round"
	class={className}
	aria-hidden="true"
>
	<path d="M12.8 19.6A2 2 0 1 0 14 16H2" />
	<path d="M9.8 4.4A2 2 0 1 1 11 8H2" />
	<path d="M17.5 8a2.5 2.5 0 1 1 2 4H2" stroke="var(--color-primary)" stroke-width="2.75" />
</svg>
