import tailwindcss from '@tailwindcss/vite';
import { VitePWA } from 'vite-plugin-pwa';
import { defineConfig } from 'vitest/config';
import { playwright } from '@vitest/browser-playwright';
import { sveltekit } from '@sveltejs/kit/vite';

export default defineConfig({
	plugins: [
		tailwindcss(),
		sveltekit(),
		VitePWA({
			registerType: 'autoUpdate',
			manifestFilename: 'manifest.json',
			manifest: {
				name: 'sunnylink',
				short_name: 'sunnylink',
				description: 'Connect with sunnypilot.',
				theme_color: '#0f1726',
				background_color: '#0f1726',
				display: 'standalone',
				start_url: '/',
				scope: '/',
				icons: [
					{
						src: 'pwa-icon-180.png',
						sizes: '180x180',
						type: 'image/png',
						purpose: 'any maskable'
					},
					{
						src: 'pwa-icon-192.png',
						sizes: '192x192',
						type: 'image/png',
						purpose: 'any maskable'
					},
					{
						src: 'pwa-icon-512.png',
						sizes: '512x512',
						type: 'image/png',
						purpose: 'any maskable'
					}
				]
			},
			workbox: {
				globPatterns: ['**/*.{js,css,html,svg,png,ico,webmanifest}'],
				navigateFallback: '/',
				cleanupOutdatedCaches: true
			},
			devOptions: {
				enabled: true,
				type: 'module',
				navigateFallback: '/',
				suppressWarnings: true
			}
		})
	],
	test: {
		expect: { requireAssertions: true },
		coverage: {
			provider: 'v8',
			reporter: ['text', 'json', 'html', 'json-summary'],
			include: ['src/**/*.{js,ts,svelte}'],
			exclude: [
				'src/**/*.{test,spec}.{js,ts}',
				'src/**/*.svelte.{test,spec}.{js,ts}',
				'src/demo.spec.ts',
				'**/*.config.{js,ts}',
				'**/node_modules/**',
				'**/dist/**',
				'**/.svelte-kit/**',
				'**/test-data.ts',
				'**/sunnylink/**/*.d.ts',
				'src/app.d.ts'
			]
		},
		projects: [
			{
				extends: './vite.config.ts',
				test: {
					name: 'client',
					browser: {
						enabled: true,
						provider: playwright(),
						instances: [{ browser: 'chromium', headless: true }]
					},
					include: ['src/**/*.svelte.{test,spec}.{js,ts}'],
					exclude: ['src/lib/server/**']
				}
			},
			{
				extends: './vite.config.ts',
				test: {
					name: 'server',
					environment: 'node',
					include: ['src/**/*.{test,spec}.{js,ts}'],
					exclude: ['src/**/*.svelte.{test,spec}.{js,ts}']
				}
			}
		]
	}
});
