import { describe, expect, it } from 'vitest';
import { i18n } from '.';

const files = Object.keys(import.meta.glob('./locales/*/*.json'));

describe('i18n', () => {
	// a new namespace file that is neither bundled nor loadable would only show its keys
	it('reaches every locale file, bundled or as a chunk', async () => {
		await i18n.loadNamespaces(['hr', 'admin', 'security', 'demo', 'billing']);
		await i18n.loadLanguages('en');

		for (const file of files) {
			const [, lng, ns] = /^\.\/locales\/(\w+)\/(\w+)\.json$/.exec(file)!;
			expect(i18n.hasResourceBundle(lng!, ns!), file).toBe(true);
		}
	});
});
