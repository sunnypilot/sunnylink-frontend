<script lang="ts">
	import '../app.css';
	import favicon from '$lib/assets/favicon.svg';

	let { children } = $props();
	export const ssr = false;
</script>

<svelte:head>
	<link rel="icon" href={favicon} />
</svelte:head>


{@render children()}


