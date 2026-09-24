import { fc, test } from '@fast-check/vitest';
import { Temporal } from 'temporal-polyfill';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { summarizeWorkday, type Span } from '../calendar';
import type { Holiday } from '../holidays';
import {
	checkShifts,
	groupShifts,
	RULESETS,
	ruleSetFor,
	type Finding,
	type RuleSet,
	type Shift
} from './index';

const TZ = 'Europe/Berlin';

const at = (local: string) => Temporal.ZonedDateTime.from(`${local}[${TZ}]`).toInstant();
const entry = (from: string, to: string): Span => ({ start: at(from), end: at(to) });
const date = (iso: string) => Temporal.PlainDate.from(iso);
const day = (iso: string, ...entries: Span[]): Shift => ({ date: date(iso), entries });
const statutory = (iso: string): Holiday => ({ date: date(iso), code: 'labour_day', portion: 1 });
const everything = { from: date('2000-01-01'), to: date('2099-12-31') };
const check = (shifts: Shift[], holidays: string[] = [], range = everything) =>
	checkShifts(shifts, { timeZone: TZ, holidays: holidays.map(statutory), range });
const codes = (findings: Finding[]) => findings.map((finding) => finding.code);

describe('ruleSetFor', () => {
	it('picks the 1994 act for a current date', () => {
		expect(ruleSetFor(date('2026-09-24')).version).toBe('arbzg-1994');
	});

	it('applies the act from the day it came into force', () => {
		expect(ruleSetFor(date('1994-07-01')).version).toBe('arbzg-1994');
	});

	it('falls back to the oldest rule set before the act', () => {
		expect(ruleSetFor(date('1990-01-01')).version).toBe('arbzg-1994');
	});

	describe('with a later reform', () => {
		const reform: RuleSet = {
			version: 'arbzg-test',
			validFrom: date('2027-01-01'),
			limits: {
				regularDailyMinutes: 480,
				maxDailyMinutes: 720,
				breakOver6hMinutes: 30,
				breakOver9hMinutes: 45,
				minBreakMinutes: 15,
				maxContinuousMinutes: 360,
				minRestMinutes: 540
			}
		};

		beforeAll(() => {
			(RULESETS as RuleSet[]).push(reform);
		});

		afterAll(() => {
			(RULESETS as RuleSet[]).pop();
		});

		it('switches on the day the reform takes effect', () => {
			expect(ruleSetFor(date('2026-12-31')).version).toBe('arbzg-1994');
			expect(ruleSetFor(date('2027-01-01')).version).toBe('arbzg-test');
			expect(ruleSetFor(date('2030-06-15')).version).toBe('arbzg-test');
		});

		it('checks each day against the limits valid on that day', () => {
			const long = (iso: string) =>
				day(iso, entry(`${iso}T06:00`, `${iso}T11:00`), entry(`${iso}T11:45`, `${iso}T17:45`));
			const findings = check([long('2026-12-29'), long('2027-01-05')]);
			expect(findings.map(({ code, ruleVersion }) => [code, ruleVersion])).toEqual([
				['ARBZG_3_OVER_10', 'arbzg-1994'],
				['ARBZG_3_OVER_8', 'arbzg-test']
			]);
		});

		it('judges the rest period by the rule set of the following day', () => {
			const findings = check([
				day('2026-12-30', entry('2026-12-30T18:00', '2026-12-30T22:00')),
				day(
					'2026-12-31',
					entry('2026-12-31T08:00', '2026-12-31T12:00'),
					entry('2026-12-31T18:00', '2026-12-31T22:00')
				),
				day('2027-01-01', entry('2027-01-01T08:00', '2027-01-01T12:00'))
			]);
			expect(findings.map(({ code, date, facts }) => [code, date.toString(), facts])).toEqual([
				['ARBZG_5_REST_UNDER_11H', '2026-12-31', { restMinutes: 600 }]
			]);
		});
	});
});

describe('groupShifts', () => {
	it('keeps a night shift with a break after midnight together on the day it began', () => {
		const evening = entry('2026-03-02T22:00', '2026-03-03T01:00');
		const night = entry('2026-03-03T01:30', '2026-03-03T06:00');
		expect(groupShifts([night, evening], TZ)).toEqual([
			{ date: date('2026-03-02'), entries: [evening, night] }
		]);
	});

	it('keeps a gap of two hours and 59 minutes within the shift', () => {
		const late = entry('2026-03-02T20:00', '2026-03-03T00:00');
		const early = entry('2026-03-03T02:59', '2026-03-03T05:00');
		expect(groupShifts([late, early], TZ)).toHaveLength(1);
	});

	it('starts a new shift after a gap of three hours', () => {
		const late = entry('2026-03-02T20:00', '2026-03-03T00:00');
		const early = entry('2026-03-03T03:00', '2026-03-03T07:00');
		expect(groupShifts([late, early], TZ)).toEqual([
			{ date: date('2026-03-02'), entries: [late] },
			{ date: date('2026-03-03'), entries: [early] }
		]);
	});

	it('keeps a split shift on one date together whatever the gap', () => {
		const morning = entry('2026-03-02T06:00', '2026-03-02T10:00');
		const evening = entry('2026-03-02T16:00', '2026-03-02T20:00');
		expect(groupShifts([evening, morning], TZ)).toEqual([
			{ date: date('2026-03-02'), entries: [morning, evening] }
		]);
	});

	it('separates two days with the usual night rest', () => {
		const morning = entry('2026-03-02T08:00', '2026-03-02T12:00');
		const afternoon = entry('2026-03-02T12:30', '2026-03-02T16:30');
		const tuesday = entry('2026-03-03T09:00', '2026-03-03T13:00');
		expect(groupShifts([tuesday, afternoon, morning], TZ)).toEqual([
			{ date: date('2026-03-02'), entries: [morning, afternoon] },
			{ date: date('2026-03-03'), entries: [tuesday] }
		]);
	});

	it('dates a shift by the local day rather than the utc day', () => {
		const early = entry('2026-03-03T00:30', '2026-03-03T04:00');
		expect(early.start.toString()).toBe('2026-03-02T23:30:00Z');
		expect(groupShifts([early], TZ)[0]?.date).toEqual(date('2026-03-03'));
	});

	it('returns no shifts without entries', () => {
		expect(groupShifts([], TZ)).toEqual([]);
	});
});

describe('checkShifts', () => {
	it('accepts a regular eight hour day with a half hour break', () => {
		expect(
			check([
				day(
					'2026-03-02',
					entry('2026-03-02T08:00', '2026-03-02T12:00'),
					entry('2026-03-02T12:30', '2026-03-02T16:30')
				)
			])
		).toEqual([]);
	});

	it('notes more than eight hours as info', () => {
		const findings = check([
			day(
				'2026-03-02',
				entry('2026-03-02T07:00', '2026-03-02T11:30'),
				entry('2026-03-02T12:00', '2026-03-02T16:00')
			)
		]);
		expect(findings).toEqual([
			{
				code: 'ARBZG_3_OVER_8',
				severity: 'info',
				date: date('2026-03-02'),
				ruleVersion: 'arbzg-1994',
				facts: { minutes: 510 }
			}
		]);
	});

	it('warns about more than ten hours', () => {
		const findings = check([
			day(
				'2026-03-02',
				entry('2026-03-02T07:00', '2026-03-02T12:00'),
				entry('2026-03-02T12:45', '2026-03-02T18:25')
			)
		]);
		expect(findings).toEqual([
			{
				code: 'ARBZG_3_OVER_10',
				severity: 'warning',
				date: date('2026-03-02'),
				ruleVersion: 'arbzg-1994',
				facts: { minutes: 640 }
			}
		]);
	});

	it('treats exactly eight hours as regular and exactly ten hours as still allowed', () => {
		const eight = day(
			'2026-03-02',
			entry('2026-03-02T07:00', '2026-03-02T11:00'),
			entry('2026-03-02T11:30', '2026-03-02T15:30')
		);
		const ten = day(
			'2026-03-04',
			entry('2026-03-04T06:00', '2026-03-04T11:00'),
			entry('2026-03-04T11:45', '2026-03-04T16:45')
		);
		expect(codes(check([eight]))).toEqual([]);
		expect(codes(check([ten]))).toEqual(['ARBZG_3_OVER_8']);
	});

	it('asks for 45 minutes of break beyond nine hours', () => {
		const findings = check([
			day(
				'2026-03-02',
				entry('2026-03-02T07:00', '2026-03-02T12:00'),
				entry('2026-03-02T12:30', '2026-03-02T17:00')
			)
		]);
		expect(codes(findings)).toEqual(['ARBZG_3_OVER_8', 'ARBZG_4_BREAK_SHORT']);
		expect(findings[1]?.facts).toEqual({ requiredMinutes: 45, actualMinutes: 30 });
	});

	it('counts the break requirements cumulatively, not on top of each other', () => {
		const findings = check([
			day(
				'2026-03-02',
				entry('2026-03-02T07:00', '2026-03-02T12:00'),
				entry('2026-03-02T12:45', '2026-03-02T17:00')
			)
		]);
		expect(codes(findings)).toEqual(['ARBZG_3_OVER_8']);
	});

	it('counts only breaks of at least 15 minutes', () => {
		const findings = check([
			day(
				'2026-03-02',
				entry('2026-03-02T08:00', '2026-03-02T12:00'),
				entry('2026-03-02T12:10', '2026-03-02T12:40'),
				entry('2026-03-02T12:50', '2026-03-02T14:50')
			)
		]);
		expect(findings.map(({ code, facts }) => [code, facts])).toEqual([
			['ARBZG_4_BREAK_SHORT', { requiredMinutes: 30, actualMinutes: 0 }],
			['ARBZG_4_CONTINUOUS_6H', { continuousMinutes: 390 }]
		]);
	});

	it('accepts the break split into two parts of 15 minutes', () => {
		const findings = check([
			day(
				'2026-03-02',
				entry('2026-03-02T08:00', '2026-03-02T11:00'),
				entry('2026-03-02T11:15', '2026-03-02T14:00'),
				entry('2026-03-02T14:15', '2026-03-02T15:00')
			)
		]);
		expect(findings).toEqual([]);
	});

	it('flags six hours and 45 minutes in one stretch', () => {
		const findings = check([day('2026-03-02', entry('2026-03-02T08:00', '2026-03-02T14:45'))]);
		expect(findings.map(({ code, facts }) => [code, facts])).toEqual([
			['ARBZG_4_BREAK_SHORT', { requiredMinutes: 30, actualMinutes: 0 }],
			['ARBZG_4_CONTINUOUS_6H', { continuousMinutes: 405 }]
		]);
	});

	it('allows exactly six hours without a break', () => {
		expect(check([day('2026-03-02', entry('2026-03-02T08:00', '2026-03-02T14:00'))])).toEqual([]);
	});

	it('measures the break thresholds by working time, not by time spent at work', () => {
		const six = day(
			'2026-03-02',
			entry('2026-03-02T08:00', '2026-03-02T12:00'),
			entry('2026-03-02T12:20', '2026-03-02T14:20')
		);
		const nine = day(
			'2026-03-04',
			entry('2026-03-04T07:00', '2026-03-04T12:00'),
			entry('2026-03-04T12:30', '2026-03-04T16:30')
		);
		expect(check([six])).toEqual([]);
		expect(codes(check([nine]))).toEqual(['ARBZG_3_OVER_8']);
	});

	it('flags a rest period of nine hours and 15 minutes on the following day', () => {
		const findings = check([
			day('2026-03-02', entry('2026-03-02T18:00', '2026-03-02T22:00')),
			day('2026-03-03', entry('2026-03-03T07:15', '2026-03-03T11:15'))
		]);
		expect(findings).toEqual([
			{
				code: 'ARBZG_5_REST_UNDER_11H',
				severity: 'warning',
				date: date('2026-03-03'),
				ruleVersion: 'arbzg-1994',
				facts: { restMinutes: 555 }
			}
		]);
	});

	it('accepts exactly eleven hours of rest', () => {
		const findings = check([
			day('2026-03-02', entry('2026-03-02T18:00', '2026-03-02T22:00')),
			day('2026-03-03', entry('2026-03-03T09:00', '2026-03-03T13:00'))
		]);
		expect(findings).toEqual([]);
	});

	it('compares rest periods in date order whatever order the days come in', () => {
		const findings = check([
			day('2026-03-04', entry('2026-03-04T06:00', '2026-03-04T10:00')),
			day('2026-03-03', entry('2026-03-03T16:00', '2026-03-03T20:00'))
		]);
		expect(findings.map(({ code, date, facts }) => [code, date.toString(), facts])).toEqual([
			['ARBZG_5_REST_UNDER_11H', '2026-03-04', { restMinutes: 600 }]
		]);
	});

	it('measures rest in real minutes across the switch to summer time', () => {
		const findings = check([
			day('2026-03-28', entry('2026-03-28T18:00', '2026-03-28T22:00')),
			day('2026-03-29', entry('2026-03-29T09:00', '2026-03-29T13:00'))
		]);
		expect(codes(findings)).toEqual(['ARBZG_5_REST_UNDER_11H', 'ARBZG_9_SUNDAY']);
		expect(findings[0]?.facts).toEqual({ restMinutes: 600 });
	});

	it('warns about work on a sunday', () => {
		const findings = check([day('2026-03-01', entry('2026-03-01T10:00', '2026-03-01T14:00'))]);
		expect(findings).toEqual([
			{
				code: 'ARBZG_9_SUNDAY',
				severity: 'warning',
				date: date('2026-03-01'),
				ruleVersion: 'arbzg-1994',
				facts: {}
			}
		]);
	});

	it('warns about work on a public holiday', () => {
		const findings = check(
			[day('2026-05-01', entry('2026-05-01T10:00', '2026-05-01T14:00'))],
			['2026-05-01']
		);
		expect(codes(findings)).toEqual(['ARBZG_9_HOLIDAY']);
		expect(findings[0]?.severity).toBe('warning');
	});

	it('reports a holiday on a sunday under both rules', () => {
		const findings = check(
			[day('2026-04-05', entry('2026-04-05T10:00', '2026-04-05T14:00'))],
			['2026-04-03', '2026-04-05', '2026-04-06']
		);
		expect(codes(findings)).toEqual(['ARBZG_9_HOLIDAY', 'ARBZG_9_SUNDAY']);
	});

	it('raises no § 9 finding on the company half days 24 and 31 december', () => {
		const halfDays: Holiday[] = [
			{ date: date('2026-12-24'), code: 'christmas_eve', portion: 0.5 },
			{ date: date('2026-12-31'), code: 'new_years_eve', portion: 0.5 }
		];
		const findings = checkShifts(
			[
				day('2026-12-24', entry('2026-12-24T08:00', '2026-12-24T12:00')),
				day('2026-12-31', entry('2026-12-31T08:00', '2026-12-31T12:00'))
			],
			{ timeZone: TZ, holidays: halfDays, range: everything }
		);
		expect(findings).toEqual([]);
	});

	it('uses the day before the range only to measure the rest period', () => {
		const findings = check(
			[
				day('2026-03-02', entry('2026-03-02T11:00', '2026-03-02T22:00')),
				day('2026-03-03', entry('2026-03-03T07:15', '2026-03-03T11:15'))
			],
			[],
			{ from: date('2026-03-03'), to: date('2026-03-03') }
		);
		expect(findings.map(({ code, date, facts }) => [code, date.toString(), facts])).toEqual([
			['ARBZG_5_REST_UNDER_11H', '2026-03-03', { restMinutes: 555 }]
		]);
	});

	it('reports nothing for days after the range', () => {
		const findings = check(
			[
				day('2026-03-02', entry('2026-03-02T18:00', '2026-03-02T22:00')),
				day('2026-03-03', entry('2026-03-03T07:15', '2026-03-03T11:15'))
			],
			[],
			{ from: date('2026-03-01'), to: date('2026-03-02') }
		);
		expect(findings).toEqual([]);
	});

	it('ignores shifts without entries', () => {
		expect(check([day('2026-03-01')], ['2026-03-01'])).toEqual([]);
	});

	it('checks a night shift with a break after midnight as one shift', () => {
		const shifts = groupShifts(
			[
				entry('2026-03-02T20:00', '2026-03-03T00:30'),
				entry('2026-03-03T01:00', '2026-03-03T05:00')
			],
			TZ
		);
		expect(check(shifts)).toEqual([
			{
				code: 'ARBZG_3_OVER_8',
				severity: 'info',
				date: date('2026-03-02'),
				ruleVersion: 'arbzg-1994',
				facts: { minutes: 510 }
			}
		]);
	});

	it('measures the rest from the end of a night shift to the next shift', () => {
		const shifts = groupShifts(
			[
				entry('2026-03-02T18:00', '2026-03-02T21:00'),
				entry('2026-03-02T21:30', '2026-03-03T01:00'),
				entry('2026-03-03T08:00', '2026-03-03T12:00')
			],
			TZ
		);
		expect(check(shifts).map(({ code, date, facts }) => [code, date.toString(), facts])).toEqual([
			['ARBZG_5_REST_UNDER_11H', '2026-03-03', { restMinutes: 420 }]
		]);
	});

	it('counts whole minutes, so a few seconds past eight hours stay regular', () => {
		const stamped = (from: string, to: string) => ({
			start: Temporal.Instant.from(from),
			end: Temporal.Instant.from(to)
		});
		const findings = check([
			day(
				'2026-03-02',
				stamped('2026-03-02T07:00:00Z', '2026-03-02T11:00:20Z'),
				stamped('2026-03-02T11:30:00Z', '2026-03-02T15:29:50Z')
			)
		]);
		expect(findings).toEqual([]);
	});

	it('reports the rest period in whole minutes', () => {
		const findings = check([
			day('2026-03-02', {
				start: at('2026-03-02T18:00'),
				end: Temporal.Instant.from('2026-03-02T21:00:40Z')
			}),
			day('2026-03-03', entry('2026-03-03T07:15', '2026-03-03T11:15'))
		]);
		expect(findings[0]?.facts).toEqual({ restMinutes: 554 });
	});

	it('sorts findings by date and then by code', () => {
		const findings = check([
			day('2026-03-02', entry('2026-03-02T07:00', '2026-03-02T17:30')),
			day('2026-03-01', entry('2026-03-01T06:00', '2026-03-01T13:00'))
		]);
		expect(findings.map(({ code, date }) => [date.toString(), code])).toEqual([
			['2026-03-01', 'ARBZG_4_BREAK_SHORT'],
			['2026-03-01', 'ARBZG_4_CONTINUOUS_6H'],
			['2026-03-01', 'ARBZG_9_SUNDAY'],
			['2026-03-02', 'ARBZG_3_OVER_10'],
			['2026-03-02', 'ARBZG_4_BREAK_SHORT'],
			['2026-03-02', 'ARBZG_4_CONTINUOUS_6H']
		]);
	});
});

type Piece = { gap: number; length: number };

// the gap of the first piece only moves the start, every later gap lies between two entries
const shiftOf = (parts: readonly Piece[], iso = '2026-03-02'): Shift => {
	let cursor = at(`${iso}T06:00`);
	const entries = parts.map(({ gap, length }) => {
		const start = cursor.add({ minutes: gap });
		cursor = start.add({ minutes: length });
		return { start, end: cursor };
	});
	return { date: date(iso), entries };
};

const piece = fc.record({
	gap: fc.integer({ min: 0, max: 90 }),
	length: fc.integer({ min: 1, max: 300 })
});
const pieces = fc.array(piece, { minLength: 1, maxLength: 6 });

// past ten hours OVER_8 turns into OVER_10, so the level is compared rather than the codes
const overtimeLevel = (findings: Finding[]) =>
	findings.some((finding) => finding.code === 'ARBZG_3_OVER_10')
		? 2
		: findings.some((finding) => finding.code === 'ARBZG_3_OVER_8')
			? 1
			: 0;

const breakCodes = (findings: Finding[]) =>
	codes(findings).filter((code) => code.startsWith('ARBZG_4_'));

describe('checkShifts properties', () => {
	test.prop([pieces, fc.nat(), fc.integer({ min: 1, max: 600 })], { numRuns: 1000 })(
		'more work never removes a § 3 finding',
		(parts, pick, extra) => {
			const index = pick % parts.length;
			const longer = parts.map((part, i) =>
				i === index ? { ...part, length: part.length + extra } : part
			);
			expect(overtimeLevel(check([shiftOf(longer)]))).toBeGreaterThanOrEqual(
				overtimeLevel(check([shiftOf(parts)]))
			);
		}
	);

	test.prop([pieces, piece, fc.nat()], { numRuns: 1000 })(
		'an extra entry never removes a § 3 finding',
		(parts, extra, pick) => {
			const withExtra = parts.toSpliced(pick % (parts.length + 1), 0, extra);
			expect(overtimeLevel(check([shiftOf(withExtra)]))).toBeGreaterThanOrEqual(
				overtimeLevel(check([shiftOf(parts)]))
			);
		}
	);

	test.prop(
		[fc.array(piece, { minLength: 2, maxLength: 6 }), fc.nat(), fc.integer({ min: 1, max: 120 })],
		{ numRuns: 1000 }
	)('a longer break never adds a § 4 finding', (parts, pick, extra) => {
		// index 0 is left out, stretching its gap would only move the start of the day
		const index = 1 + (pick % (parts.length - 1));
		const longer = parts.map((part, i) =>
			i === index ? { ...part, gap: part.gap + extra } : part
		);
		const before = breakCodes(check([shiftOf(parts)]));
		for (const code of breakCodes(check([shiftOf(longer)]))) {
			expect(before).toContain(code);
		}
	});

	const origin = date('2026-03-02');
	const week = fc.uniqueArray(
		fc.record({ offset: fc.integer({ min: 0, max: 9 }), parts: pieces }),
		{
			selector: (draft) => draft.offset,
			maxLength: 5
		}
	);

	test.prop([week, fc.integer({ min: 0, max: 9 }), fc.integer({ min: 0, max: 9 })], {
		numRuns: 1000
	})('a range reports exactly the findings its days get in the full check', (drafts, a, b) => {
		const days = drafts.map(({ offset, parts }) =>
			shiftOf(parts, origin.add({ days: offset }).toString())
		);
		const from = origin.add({ days: Math.min(a, b) });
		const to = origin.add({ days: Math.max(a, b) });
		const inside = (finding: Finding) =>
			Temporal.PlainDate.compare(finding.date, from) >= 0 &&
			Temporal.PlainDate.compare(finding.date, to) <= 0;
		expect(check(days, [], { from, to })).toEqual(check(days).filter(inside));
	});

	// seconds on every stamp, the way now() of the database writes them
	const stamped = fc.array(
		fc.record({
			gap: fc.integer({ min: 0, max: 3600 }),
			length: fc.integer({ min: 1, max: 7200 })
		}),
		{ minLength: 1, maxLength: 6 }
	);

	test.prop([stamped], { numRuns: 1000 })(
		'a shift reports the same whole minutes the workday summary shows',
		(parts) => {
			let cursor = at('2026-03-02T06:00');
			const entries = parts.map(({ gap, length }) => {
				const start = cursor.add({ seconds: gap });
				cursor = start.add({ seconds: length });
				return { start, end: cursor };
			});
			const summary = summarizeWorkday(entries, cursor, TZ);
			const shifts = groupShifts(entries, TZ);
			const findings = check(shifts);

			expect(shifts).toHaveLength(1);
			const overtime = findings.find((finding) => finding.code.startsWith('ARBZG_3_'));
			if (summary.workedMinutes <= 480) {
				expect(overtime).toBeUndefined();
			} else {
				expect(overtime?.facts).toEqual({ minutes: summary.workedMinutes });
			}
			for (const finding of findings) {
				for (const fact of Object.values(finding.facts)) {
					expect(Number.isInteger(fact)).toBe(true);
				}
			}
		}
	);

	const spread = fc.array(
		fc.record({ gap: fc.integer({ min: 0, max: 900 }), length: fc.integer({ min: 1, max: 300 }) }),
		{ minLength: 1, maxLength: 10 }
	);

	test.prop([spread], { numRuns: 1000 })(
		'shifts break only at three hours without work and never within one date',
		(parts) => {
			const shifts = groupShifts(shiftOf(parts).entries, TZ);
			const local = (instant: Temporal.Instant) => instant.toZonedDateTimeISO(TZ).toPlainDate();
			shifts.forEach((shift, i) => {
				const [first] = shift.entries;
				expect(shift.date).toEqual(first && local(first.start));
				shift.entries.slice(1).forEach((current, k) => {
					const gap = shift.entries[k]!.end.until(current.start).total('minutes');
					expect(gap < 180 || local(current.start).equals(shift.date)).toBe(true);
				});
				const previous = shifts[i - 1];
				if (previous) {
					const gap = previous.entries.at(-1)!.end.until(first!.start).total('minutes');
					expect(gap).toBeGreaterThanOrEqual(180);
					expect(Temporal.PlainDate.compare(previous.date, shift.date)).toBeLessThan(0);
				}
			});
			expect(shifts.flatMap((shift) => shift.entries)).toEqual(shiftOf(parts).entries);
		}
	);
});
