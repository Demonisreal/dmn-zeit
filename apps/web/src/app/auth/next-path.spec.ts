import { describe, expect, it } from 'vitest';
import { nextPath } from './next-path';

describe('nextPath', () => {
	it('keeps paths inside the app', () => {
		expect(nextPath.parse('/zeit')).toBe('/zeit');
		expect(nextPath.parse('/abwesenheiten?monat=2026-09#heute')).toBe(
			'/abwesenheiten?monat=2026-09#heute'
		);
		expect(nextPath.parse(undefined)).toBeUndefined();
	});

	it('drops anything the browser could read as another host', () => {
		for (const target of [
			'//evil.test',
			'/\\evil.test',
			'/zeit\\..\\evil',
			'https://evil.test',
			'/\t/evil.test',
			'/\n/evil.test',
			'/zeit\r\nSet-Cookie: x=1',
			'/zeit\u0000',
			'/zeit\u007f'
		]) {
			expect(nextPath.parse(target)).toBeUndefined();
		}
	});
});
