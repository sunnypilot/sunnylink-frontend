export const pwaConfiguration = {
    registerType: 'autoUpdate',
    manifestFilename: 'manifest.json',
    manifest: {
        name: 'sunnylink',
        short_name: 'sunnylink',
        description: 'Connect with sunnypilot.',
        theme_color: '#ffffff',
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
    kit: {
        // We really want to cache everything, including the starting page.
        // In dev, this can be tricky, but for production it's essential.
        includeVersionFile: true,
    },
    workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,ico,webmanifest}'],
        // Navigate fallback is key for SPA routing in PWA
        navigateFallback: '/',
        // Don't fallback for API routes or other non-page assets if needed
        navigateFallbackDenylist: [/^\/api\//]
    },
    devOptions: {
        enabled: false,
        type: 'module',
        navigateFallback: '/',
    }
};
