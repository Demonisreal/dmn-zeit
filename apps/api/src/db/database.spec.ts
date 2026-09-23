import { instantSchema } from '@zeit/shared';
import { describe, expect, it } from 'vitest';
import { isoInstant } from './database';

describe('isoInstant', () => {
	it('turns the pg text form into ISO 8601 and keeps the microseconds', () => {
		expect(isoInstant('2026-09-24 08:15:00.123456+00')).toBe('2026-09-24T08:15:00.123456Z');
		expect(isoInstant('2026-03-29 01:00:00+00')).toBe('2026-03-29T01:00:00Z');
	});

	it('produces what the api contract accepts', () => {
		expect(instantSchema.safeParse(isoInstant('2026-10-25 00:59:59.5+00')).success).toBe(true);
	});
});
