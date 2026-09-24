import js from '@eslint/js';
import { defineConfig } from 'eslint/config';
import tseslint from 'typescript-eslint';

const rawSql =
	'Raw SQL skips parameter binding. Use the sql template tag, sql.ref or sql.table instead.';
const rawHtml = 'Writing HTML strings into the DOM opens the door to XSS. Render through React.';

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
				{ object: 'CompiledQuery', property: 'raw', message: rawSql },
				{ object: 'document', property: 'write', message: rawHtml }
			],
			'no-restricted-syntax': [
				'error',
				{ selector: "JSXAttribute[name.name='dangerouslySetInnerHTML']", message: rawHtml },
				{
					selector: 'AssignmentExpression[left.property.name=/^(innerHTML|outerHTML)$/]',
					message: rawHtml
				},
				{ selector: "CallExpression[callee.property.name='insertAdjacentHTML']", message: rawHtml }
			],
			'no-eval': 'error',
			'no-implied-eval': 'error',
			'no-new-func': 'error'
		}
	}
);
