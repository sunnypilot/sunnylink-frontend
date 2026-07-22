<script lang="ts">
	import { onMount } from 'svelte';
	import { translateRuntimeText } from '$lib/i18n/runtime';

	const attributes = ['aria-label', 'title', 'placeholder'];

	function localizeNode(root: Node) {
		if (root.nodeType === Node.TEXT_NODE) {
			const parent = root.parentElement;
			if (!parent || ['SCRIPT', 'STYLE', 'CODE', 'PRE'].includes(parent.tagName)) return;
			const value = root.textContent ?? '';
			const translated = translateRuntimeText(value);
			if (translated !== value) root.textContent = translated;
			return;
		}

		if (!(root instanceof Element)) return;
		for (const attribute of attributes) {
			const value = root.getAttribute(attribute);
			if (!value) continue;
			const translated = translateRuntimeText(value);
			if (translated !== value) root.setAttribute(attribute, translated);
		}
		for (const child of root.childNodes) localizeNode(child);
	}

	onMount(() => {
		document.documentElement.lang = 'zh-TW';
		localizeNode(document.body);
		const observer = new MutationObserver((mutations) => {
			for (const mutation of mutations) {
				if (mutation.type === 'attributes') localizeNode(mutation.target);
				if (mutation.type === 'characterData') localizeNode(mutation.target);
				for (const node of mutation.addedNodes) localizeNode(node);
			}
		});
		observer.observe(document.body, {
			subtree: true,
			childList: true,
			characterData: true,
			attributes: true,
			attributeFilter: attributes
		});
		return () => observer.disconnect();
	});
</script>
