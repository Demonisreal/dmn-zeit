import { describe, expect, it } from 'vitest';
import { emailSchema, multilineText, plainText, reasonSchema } from './common';

const char = (code: number) => String.fromCharCode(code);
const messages = (parsed: { error?: { issues: { message: string }[] } }) =>
	parsed.error?.issues.map((issue) => issue.message);

describe('plainText', () => {
	const name = plainText(20);

	it('trims, including zero-width characters at the edges', () => {
		expect(name.parse('  Anna Berg  ')).toBe('Anna Berg');
		expect(name.parse(`${char(0x200b)}Anna${char(0xfeff)} `)).toBe('Anna');
	});

	it('keeps a joiner inside the text', () => {
		const family = `${char(0xd83d)}${char(0xdc69)}${char(0x200d)}${char(0xd83d)}${char(0xdc67)}`;
		expect(name.parse(family)).toBe(family);
	});

	it('stores composed and decomposed umlauts the same way', () => {
		const composed = `J${char(0xe4)}ger`;
		const decomposed = `Ja${char(0x308)}ger`;
		expect(name.parse(decomposed)).toBe(composed);
		expect(name.parse(decomposed)).toBe(name.parse(composed));
	});

	it('refuses control characters, line breaks and tabs inside', () => {
		for (const code of [0x0, 0x7, 0x9, 0xa, 0xd, 0x1b, 0x7f, 0x85, 0x9f, 0x2028]) {
			expect(messages(name.safeParse(`Anna${char(code)}Berg`))).toEqual(['text.controlChars']);
		}
	});

	it('refuses bidi overrides and isolates', () => {
		for (const code of [0x202a, 0x202e, 0x2066, 0x2069]) {
			expect(messages(name.safeParse(`invoice${char(code)}fdp.exe`))).toEqual([
				'text.controlChars'
			]);
		}
	});

	it('calls whitespace only empty', () => {
		expect(messages(name.safeParse('   '))).toEqual(['text.empty']);
		expect(messages(name.safeParse(char(0x200b)))).toEqual(['text.empty']);
	});

	it('counts the length after cleaning', () => {
		const decomposed = `a${char(0x308)}`.repeat(20);
		expect(name.safeParse(decomposed).success).toBe(true);
		expect(name.safeParse('x'.repeat(21)).success).toBe(false);
		expect(name.safeParse(`  ${'x'.repeat(20)}  `).success).toBe(true);
	});
});

describe('multilineText', () => {
	const note = multilineText(100);

	it('keeps line breaks and unifies them', () => {
		expect(note.parse('erste Zeile\r\nzweite\rdritte\n')).toBe('erste Zeile\nzweite\ndritte');
	});

	it('still refuses tabs and other controls', () => {
		expect(messages(note.safeParse('Spalte\tSpalte'))).toEqual(['text.controlChars']);
		expect(messages(note.safeParse(`Zeile${char(0x202e)}`))).toEqual(['text.controlChars']);
	});
});

describe('reasonSchema', () => {
	it('reports an empty reason as empty, not as too short', () => {
		expect(messages(reasonSchema.safeParse(' \n '))).toEqual(['text.empty']);
		expect(reasonSchema.safeParse('zu kurz').success).toBe(false);
		expect(reasonSchema.safeParse('Gehen vergessen').success).toBe(true);
	});
});

describe('emailSchema', () => {
	it('trims and lowercases before checking', () => {
		expect(emailSchema.parse('  Anna.Berg@Example.COM ')).toBe('anna.berg@example.com');
		expect(emailSchema.safeParse('anna@').success).toBe(false);
		expect(emailSchema.safeParse(`${'a'.repeat(250)}@x.de`).success).toBe(false);
	});
});
