import { defineConfig } from 'vitest/config';

export default defineConfig({
	test: {
		environment: 'node',
		include: ['test/**/*.int.spec.ts'],
		globalSetup: ['test/helpers/global-setup.ts'],
		setupFiles: ['test/helpers/database.ts'],
		testTimeout: 30_000,
		hookTimeout: 60_000
	}
});
