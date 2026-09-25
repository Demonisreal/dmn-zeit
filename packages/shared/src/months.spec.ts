import { describe, expect, it } from 'vitest';
import { monthChecklistSchema, monthClosingSchema } from './months';

const anna = { id: '5c3e2d1a-0f9b-4a8c-b7d6-e5f4a3b2c1d0', name: 'Anna Berg' };

describe('monthChecklistSchema', () => {
	const checklist = { month: '2026-09', closed: false, closable: true, items: [] };

	it('shows who the closing would cap', () => {
		expect(monthChecklistSchema.parse({ ...checklist, capPreview: [] }).capPreview).toEqual([]);
		expect(
			monthChecklistSchema.parse({
				...checklist,
				capPreview: [{ employee: anna, forfeitedMinutes: 120 }]
			}).capPreview
		).toEqual([{ employee: anna, forfeitedMinutes: 120 }]);
	});

	it('also shows a minus debt the closing would forgive', () => {
		expect(
			monthChecklistSchema.parse({
				...checklist,
				capPreview: [{ employee: anna, forfeitedMinutes: -90 }]
			}).capPreview
		).toEqual([{ employee: anna, forfeitedMinutes: -90 }]);
	});

	it('wants the preview from the server every time', () => {
		expect(monthChecklistSchema.safeParse(checklist).success).toBe(false);
	});

	it('leaves people without a cut out of the preview', () => {
		expect(
			monthChecklistSchema.safeParse({
				...checklist,
				capPreview: [{ employee: anna, forfeitedMinutes: 0 }]
			}).success
		).toBe(false);
	});
});

describe('monthClosingSchema', () => {
	const closing = {
		id: '7a1b9c3d-2e4f-4b6a-9c8d-1e2f3a4b5c6d',
		month: '2026-09',
		action: 'close',
		reason: null,
		actor: { id: '3f6e8d2c-9b1a-4c7e-a5d4-8b3c2e1f0a9d', displayName: 'Petra Lang' },
		at: '2026-10-01T08:30:00+02:00'
	};

	it('keeps what a close has capped', () => {
		expect(
			monthClosingSchema.parse({ ...closing, capped: [{ employee: anna, forfeitedMinutes: 45 }] })
				.capped
		).toEqual([{ employee: anna, forfeitedMinutes: 45 }]);
	});

	it('takes an empty list on reopen', () => {
		const reopen = {
			...closing,
			action: 'reopen',
			reason: 'Krankmeldung vom 29.09. kam zu spät',
			capped: []
		};
		expect(monthClosingSchema.safeParse(reopen).success).toBe(true);
	});

	it('needs the list even when nothing was capped', () => {
		expect(monthClosingSchema.safeParse(closing).success).toBe(false);
	});
});
