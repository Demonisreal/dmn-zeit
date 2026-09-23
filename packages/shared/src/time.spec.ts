import { describe, expect, it } from 'vitest';
import { daysQuerySchema } from './time';

describe('daysQuerySchema', () => {
	it('takes a week across two months', () => {
		expect(daysQuerySchema.safeParse({ from: '2026-09-28', to: '2026-10-04' }).success).toBe(true);
	});

	it('allows 62 days and not one more', () => {
		expect(daysQuerySchema.safeParse({ from: '2026-01-01', to: '2026-03-03' }).success).toBe(true);

		const tooLong = daysQuerySchema.safeParse({ from: '2026-01-01', to: '2026-03-04' });
		expect(tooLong.success).toBe(false);
		expect(tooLong.error?.issues[0]).toMatchObject({
			message: 'range.tooLong',
			path: ['to'],
			params: { max: 62 }
		});
	});

	it('refuses a range that runs backwards', () => {
		const backwards = daysQuerySchema.safeParse({ from: '2026-10-04', to: '2026-09-28' });
		expect(backwards.error?.issues[0]?.message).toBe('range.unordered');
	});
});
