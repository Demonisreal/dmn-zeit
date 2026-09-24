import { defineConfig } from 'vitest/config';

export default defineConfig({
	test: {
		environment: 'node',
		include: ['src/**/*.spec.ts'],
		// 1000 property runs take up to 5 s under coverage, the default timeout
		testTimeout: 20_000,
		coverage: {
			include: ['src/**/*.ts'],
			thresholds: { statements: 95, branches: 95, functions: 95, lines: 95 }
		}
	}
});
