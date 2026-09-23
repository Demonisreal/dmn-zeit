import { defineConfig } from 'tsup';

export default defineConfig({
	entry: ['src/index.ts'],
	format: ['esm', 'cjs'],
	// tsup injects baseUrl into the dts build, which typescript 6 rejects as deprecated
	dts: { compilerOptions: { ignoreDeprecations: '6.0' } },
	sourcemap: true,
	clean: true
});
