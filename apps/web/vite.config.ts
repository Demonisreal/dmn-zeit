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
		headers: { 'Service-Worker-Allowed': '/' }
	},
	test: {
		environment: 'jsdom',
		include: ['src/**/*.spec.{ts,tsx}'],
		setupFiles: ['src/test/setup.ts'],
		testTimeout: 20_000
	}
});
