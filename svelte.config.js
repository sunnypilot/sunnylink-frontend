import adapter from '@sveltejs/adapter-static';

const config = {
	kit: {
		adapter: adapter({
			pages: 'build',
			assets: 'build',
			// IMPORTANT for GitHub Pages SPA routing:
			fallback: '404.html',
			precompress: false
		}),
		// Use the base path from CI (BASE_PATH=/sunnylink-frontend)
		paths: {
			base: process.env.BASE_PATH || ''
		}
	}
};

export default config;
