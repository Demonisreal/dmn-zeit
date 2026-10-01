import { validateHeaderValue } from 'node:http';
import { describe, expect, it } from 'vitest';
import { contentDisposition } from './exports.controller';

describe('contentDisposition', () => {
	it('leaves a plain name as it is', () => {
		expect(contentDisposition('month-overview-2026-04.csv')).toBe(
			`attachment; filename="month-overview-2026-04.csv"; filename*=UTF-8''month-overview-2026-04.csv`
		);
	});

	it('keeps quotes out of the ascii name and carries the euro sign in filename*', () => {
		expect(contentDisposition('Spesen "Mai" 5€.csv')).toBe(
			`attachment; filename="Spesen__Mai__5_.csv"; filename*=UTF-8''Spesen%20%22Mai%22%205%E2%82%AC.csv`
		);
	});

	it('gives a line break no way into a second header', () => {
		const header = contentDisposition("a.csv\"\r\nSet-Cookie: zeit_sid=x; ('*')");
		expect(header).toBe(
			`attachment; filename="a.csv___Set-Cookie__zeit_sid_x_______"; filename*=UTF-8''a.csv%22%0D%0ASet-Cookie%3A%20zeit_sid%3Dx%3B%20%28%27%2A%27%29`
		);
		expect(() => validateHeaderValue('Content-Disposition', header)).not.toThrow();
	});
});
