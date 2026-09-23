import js from '@eslint/js';
import { defineConfig } from 'eslint/config';
import tseslint from 'typescript-eslint';

const rawSql =
	'Raw SQL skips parameter binding. Use the sql template tag, sql.ref or sql.table instead.';

export default defineConfig(
	{ ignores: ['**/dist/', '**/coverage/', 'apps/api/src/db/schema.generated.ts'] },
	js.configs.recommended,
	tseslint.configs.recommended,
	{
		rules: {
			'@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
			'no-restricted-properties': [
				'error',
				{ object: 'sql', property: 'raw', message: rawSql },
				{ object: 'CompiledQuery', property: 'raw', message: rawSql }
			]
		}
	}
);
