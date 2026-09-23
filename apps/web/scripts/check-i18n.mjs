import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import process from 'node:process';
import { fileURLToPath, URL } from 'node:url';

const root = fileURLToPath(new URL('../src/i18n/locales/', import.meta.url));
const languages = readdirSync(root);
const namespaces = [...new Set(languages.flatMap((lng) => readdirSync(join(root, lng))))];

const keysOf = (tree, prefix = '') =>
	Object.entries(tree).flatMap(([key, text]) =>
		typeof text === 'object' ? keysOf(text, `${prefix}${key}.`) : [`${prefix}${key}`]
	);

const problems = [];

for (const file of namespaces) {
	const keys = new Map();
	for (const lng of languages) {
		const path = join(root, lng, file);
		if (existsSync(path)) keys.set(lng, new Set(keysOf(JSON.parse(readFileSync(path, 'utf8')))));
		else problems.push(`${lng}/${file} is missing`);
	}

	const all = new Set([...keys.values()].flatMap((own) => [...own]));
	for (const [lng, own] of keys) {
		for (const key of all) if (!own.has(key)) problems.push(`${lng}/${file}: ${key} is missing`);
	}
}

if (problems.length > 0) {
	process.stderr.write(`${problems.join('\n')}\n`);
	process.exitCode = 1;
} else {
	process.stdout.write(`${namespaces.length} namespaces, ${languages.join(' and ')} match\n`);
}
