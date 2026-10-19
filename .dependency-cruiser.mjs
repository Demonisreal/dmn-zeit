const workspace = (name) => `(^|/)(packages/${name}|node_modules/@zeit/${name})/`;

export default {
	forbidden: [
		{
			name: 'no-unresolvable',
			comment:
				'An import that cannot be resolved would slip past every other rule. Build the packages first.',
			severity: 'error',
			from: {},
			to: { couldNotResolve: true }
		},
		{
			name: 'rules-pure',
			comment: '@zeit/rules stays free of I/O and frameworks. Only temporal-polyfill is allowed.',
			severity: 'error',
			from: { path: '^packages/rules/src' },
			to: {
				dependencyTypes: [
					'npm',
					'npm-dev',
					'npm-peer',
					'npm-optional',
					'npm-no-pkg',
					'npm-unknown',
					'core'
				],
				pathNot: '(^|/)node_modules/temporal-polyfill/'
			}
		},
		{
			name: 'rules-no-workspace',
			severity: 'error',
			from: { path: '^packages/rules/src' },
			to: { path: [workspace('shared'), workspace('demo-data'), '^apps/'] }
		},
		{
			name: 'shared-zod-only',
			comment: '@zeit/shared holds the zod contracts and nothing else.',
			severity: 'error',
			from: { path: '^packages/shared/src' },
			to: {
				dependencyTypes: [
					'npm',
					'npm-dev',
					'npm-peer',
					'npm-optional',
					'npm-no-pkg',
					'npm-unknown',
					'core'
				],
				pathNot: '(^|/)node_modules/zod/'
			}
		},
		{
			name: 'shared-no-workspace',
			severity: 'error',
			from: { path: '^packages/shared/src' },
			to: { path: [workspace('rules'), workspace('demo-data'), '^apps/'] }
		},
		{
			name: 'demo-data-no-apps',
			severity: 'error',
			from: { path: '^packages/demo-data/src' },
			to: { path: '^apps/' }
		},
		{
			name: 'demo-data-only-in-demo',
			comment: 'Only the demo module of the API may build sample data.',
			severity: 'error',
			from: { path: '^apps/api/src', pathNot: '^apps/api/src/demo/' },
			to: { path: workspace('demo-data') }
		},
		{
			name: 'web-no-server-code',
			comment: 'The SPA uses shared and rules for previews. The server stays authoritative.',
			severity: 'error',
			from: { path: '^apps/web/src' },
			to: { path: [workspace('demo-data'), '^apps/api/'] }
		},
		{
			name: 'api-no-web',
			severity: 'error',
			from: { path: '^apps/api/src' },
			to: { path: '^apps/web/' }
		},
		{
			name: 'renderers-in-documents',
			comment: 'pdfkit and @e-invoice-eu/core stay in documents/ and einvoice/ (ADR 0004).',
			severity: 'error',
			from: { path: '^apps/api/src', pathNot: '^apps/api/src/(documents|einvoice)/' },
			to: { path: '(^|/)node_modules/(pdfkit|@e-invoice-eu/core)/' }
		}
	],
	options: {
		doNotFollow: { path: 'node_modules' },
		exclude: { path: '\\.(spec|test)\\.tsx?$|\\.fixture\\.ts$|/test/|/testing\\.ts$|mocks' },
		tsPreCompilationDeps: true,
		combinedDependencies: true,
		enhancedResolveOptions: {
			exportsFields: ['exports'],
			conditionNames: ['import', 'require', 'node', 'default', 'types'],
			mainFields: ['module', 'main', 'types']
		}
	}
};
