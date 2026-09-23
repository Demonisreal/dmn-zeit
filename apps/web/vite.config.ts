import { tanstackRouter } from '@tanstack/router-plugin/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

export default defineConfig({
	plugins: [
		tanstackRouter({
			target: 'react',
			autoCodeSplitting: true,
			quoteStyle: 'single',
			semicolons: true
		}),
		react()
	],
	server: {
		proxy: { '/api': 'http://localhost:3001' },
		// the msw worker is served from node_modules in dev and still has to cover the whole app
		headers: { 'Service-Worker-Allowed': '/' }
	},
	test: {
		environment: 'jsdom',
		include: ['src/**/*.spec.{ts,tsx}'],
		setupFiles: ['src/test/setup.ts']
	}
});
