import { describe, expect, it } from 'vitest';
import { correctionsQuerySchema, createCorrectionSchema } from './corrections';

const entryId = '0b8a6c2e-5d4f-4e3a-8b1c-9d7e6f5a4b3c';
const reason = 'Gehen vergessen, war um 17 Uhr weg';

describe('createCorrectionSchema', () => {
	it('lets a void go through without times', () => {
		const parsed = createCorrectionSchema.parse({ action: 'void', entryId, reason });
		expect(parsed.action).toBe('void');
	});

	it('needs times for a change', () => {
		expect(createCorrectionSchema.safeParse({ action: 'change', entryId, reason }).success).toBe(
			false
		);
	});

	it('compares instants, not their text', () => {
		const springForward = createCorrectionSchema.safeParse({
			action: 'change',
			entryId,
			startedAt: '2026-03-29T01:30:00+01:00',
			endedAt: '2026-03-29T03:30:00+02:00',
			reason
		});
		expect(springForward.success).toBe(true);

		// 02:45 reads later than 02:30, but the summer time one came first
		const backwards = createCorrectionSchema.safeParse({
			action: 'change',
			entryId,
			startedAt: '2026-10-25T02:30:00+01:00',
			endedAt: '2026-10-25T02:45:00+02:00',
			reason
		});
		expect(backwards.success).toBe(false);
	});

	it('wants a real reason', () => {
		expect(
			createCorrectionSchema.safeParse({ action: 'void', entryId, reason: '  kurz    ' }).success
		).toBe(false);
	});

	it('refuses unknown actions', () => {
		expect(createCorrectionSchema.safeParse({ action: 'delete', entryId, reason }).success).toBe(
			false
		);
	});
});

describe('correctionsQuerySchema', () => {
	const range = { from: '2026-09-01', to: '2026-09-30' };

	it('shows the inbox without a range', () => {
		expect(correctionsQuerySchema.safeParse({ scope: 'inbox' }).success).toBe(true);
		expect(correctionsQuerySchema.safeParse({ ...range, scope: 'inbox' }).success).toBe(true);
	});

	it.each(['mine', 'all'])('wants a range for %s', (scope) => {
		expect(correctionsQuerySchema.safeParse({ scope }).error?.issues).toMatchObject([
			{ message: 'range.required', path: ['from'] }
		]);
	});

	it('still stops at a year outside the inbox', () => {
		expect(correctionsQuerySchema.safeParse({ ...range, scope: 'all' }).success).toBe(true);
		expect(
			correctionsQuerySchema.safeParse({ from: '2026-01-01', to: '2027-01-02', scope: 'all' })
				.success
		).toBe(false);
	});
});
