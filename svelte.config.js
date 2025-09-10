// svelte.config.js
import adapter from '@sveltejs/adapter-static';

const config = {
  kit: {
    adapter: adapter({
      pages: 'build',
      assets: 'build',
      fallback: 'index.html',
      precompress: false
    }),
    paths: {
      // Use environment variable if provided; otherwise default to '' (root)
      base: process.env.BASE_PATH || ''
    }
  }
};

export default config;
