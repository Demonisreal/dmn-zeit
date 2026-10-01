import { describe, expect, it } from 'vitest';
import { toCsv } from './csv';

const line = (row: (string | number)[], separator: ';' | ',' = ';') =>
	toCsv([row], separator).slice(1, -2);

describe('toCsv', () => {
	it('starts with the byte order mark and ends every line with crlf', () => {
		const csv = toCsv(
			[
				['a', 'b'],
				['c', 'd']
			],
			','
		);
		expect(csv).toBe('\uFEFFa,b\r\nc,d\r\n');
		expect(Buffer.from(csv, 'utf8').subarray(0, 3)).toEqual(Buffer.from([0xef, 0xbb, 0xbf]));
	});

	it('separates with the given character', () => {
		expect(line(['Müller', 480, 'x'], ';')).toBe('Müller;480;x');
		expect(line(['Müller', 480, 'x'], ',')).toBe('Müller,480,x');
	});

	it.each([
		['=1+1', "'=1+1"],
		['+1', "'+1"],
		['@SUM(A1:A2)', "'@SUM(A1:A2)"],
		['\t=1+1', "'\t=1+1"],
		['=HYPERLINK("http://example.test")', `"'=HYPERLINK(""http://example.test"")"`]
	])('turns %j into text', (raw, written) => {
		expect(line([raw])).toBe(written);
	});

	// B7: a negative amount written as text (german locale, comma decimal) stays a number for the sheet
	it.each([
		['-1', '-1'],
		['-120,00', '-120,00'],
		['-120.00', '-120.00']
	])('leaves the signed decimal %j alone', (raw, written) => {
		expect(line([raw])).toBe(written);
	});

	it('still defuses a leading minus followed by more than a plain number', () => {
		expect(line(['-1+1'])).toBe("'-1+1");
	});

	it('quotes a cell starting with a carriage return after defusing it', () => {
		expect(line(['\r=1+1'])).toBe(`"'\r=1+1"`);
	});

	it('leaves ordinary cells and numbers alone, negative ones too', () => {
		expect(line(['Wim Werner', '2026-04-01', '08:00-12:00', 'a=b', -90, 0, 1.5])).toBe(
			'Wim Werner;2026-04-01;08:00-12:00;a=b;-90;0;1.5'
		);
	});

	it('quotes separators, quotes and line breaks', () => {
		expect(line(['Werner; Wim'], ';')).toBe('"Werner; Wim"');
		expect(line(['Werner; Wim'], ',')).toBe('Werner; Wim');
		expect(line(['Werner, Wim'], ',')).toBe('"Werner, Wim"');
		expect(line(['Wim "der Werner"'])).toBe('"Wim ""der Werner"""');
		expect(line(['erste\nzweite'])).toBe('"erste\nzweite"');
		expect(line(['erste\r\nzweite'])).toBe('"erste\r\nzweite"');
	});
});
