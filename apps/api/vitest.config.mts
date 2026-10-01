import { configDefaults, defineConfig } from 'vitest/config';

export default defineConfig({
	test: {
		environment: 'node',
		include: ['src/**/*.spec.ts', 'test/**/*.spec.ts'],
		exclude: [...configDefaults.exclude, 'test/**/*.int.spec.ts'],
		execArgv: ['--max-old-space-size=0']
	}
});
