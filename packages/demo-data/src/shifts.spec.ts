import { checkShifts, groupShifts, holidaysFor, type ArbzgCode, type Span } from '@zeit/rules';
import { Temporal } from 'temporal-polyfill';
import { describe, expect, it } from 'vitest';
import { endOfMonth, TZ } from './calendar';
import { generateDemo, type DemoPlan } from './index';

const today = Temporal.PlainDate.from('2026-09-24');
const plan = generateDemo({ today, seed: 7 });

const CODES: readonly ArbzgCode[] = [
	'ARBZG_3_OVER_8',
	'ARBZG_3_OVER_10',
	'ARBZG_4_BREAK_SHORT',
	'ARBZG_4_CONTINUOUS_6H',
	'ARBZG_5_REST_UNDER_11H',
	'ARBZG_9_SUNDAY',
	'ARBZG_9_HOLIDAY'
];

// without now only the finished entries count, the app counts a running one up to the wall clock
function findingsOf(demo: DemoPlan, day: string, now?: Temporal.Instant) {
	const from = Temporal.PlainDate.from(demo.monthClosings[0]!.month);
	const to = Temporal.PlainDate.from(day).subtract({ days: 1 });
	const holidays = [...new Set([from.year, to.year])].flatMap((year) =>
		holidaysFor(year, 'NW', { optional: [], halfDays: false })
	);
	return demo.employees.flatMap((employee) => {
		const spans = demo.entries.flatMap(({ employeeId, startedAt, endedAt }): Span[] => {
			const end = endedAt === null ? now : Temporal.Instant.from(endedAt);
			return employeeId === employee.id && end
				? [{ start: Temporal.Instant.from(startedAt), end }]
				: [];
		});
		return checkShifts(groupShifts(spans, TZ), {
			timeZone: TZ,
			holidays,
			range: { from, to }
		}).map((finding) => ({ ...finding, employeeId: employee.id }));
	});
}

describe('generateDemo compliance scenes', () => {
	const findings = findingsOf(plan, today.toString());

	it.each(CODES)('produces at least one %s finding', (code) => {
		expect(findings.some((finding) => finding.code === code)).toBe(true);
	});
});

describe.each([
	{ day: '2026-09-24', demo: plan },
	// before august the story starts a year earlier and runs for nineteen months
	{
		day: '2027-07-31',
		demo: generateDemo({ today: Temporal.PlainDate.from('2027-07-31'), seed: 7 })
	}
])('generateDemo timesheets on $day', ({ day, demo }) => {
	const closedThrough = endOfMonth(
		Temporal.PlainYearMonth.from(demo.monthClosings.at(-1)!.month.slice(0, 7))
	).toString();
	const afternoon = Temporal.ZonedDateTime.from(`${day}T15:00[${TZ}]`).toInstant();
	const shown = findingsOf(demo, day, afternoon);
	const acked = (finding: (typeof shown)[number]) =>
		demo.findingAcks.some(
			(ack) =>
				ack.employeeId === finding.employeeId &&
				ack.workDate === finding.date.toString() &&
				ack.ruleCode === finding.code
		);

	it('raises the findings its scenes are written for and none on an ordinary day', () => {
		expect(
			findingsOf(demo, day)
				.map((finding) => finding.code)
				.sort()
		).toEqual([
			'ARBZG_3_OVER_10',
			'ARBZG_3_OVER_10',
			'ARBZG_3_OVER_8',
			'ARBZG_4_BREAK_SHORT',
			'ARBZG_4_BREAK_SHORT',
			'ARBZG_4_CONTINUOUS_6H',
			'ARBZG_5_REST_UNDER_11H',
			'ARBZG_9_HOLIDAY',
			'ARBZG_9_SUNDAY'
		]);
	});

	it('acknowledges everything up to the last closed month and leaves the open month alone', () => {
		const closed = shown.filter((finding) => finding.date.toString() <= closedThrough);
		const open = shown.filter((finding) => finding.date.toString() > closedThrough);
		expect(closed.length).toBeGreaterThan(0);
		expect(closed.filter((finding) => !acked(finding))).toEqual([]);
		expect(open.length).toBeGreaterThan(0);
		expect(open.filter(acked)).toEqual([]);
		expect(demo.findingAcks.filter((ack) => ack.workDate > closedThrough)).toEqual([]);
	});

	it('only acknowledges findings the app shows, down to the rule version', () => {
		expect(
			demo.findingAcks.filter(
				(ack) =>
					!shown.some(
						(finding) =>
							finding.employeeId === ack.employeeId &&
							finding.date.toString() === ack.workDate &&
							finding.code === ack.ruleCode &&
							finding.ruleVersion === ack.ruleVersion
					)
			)
		).toEqual([]);
	});

	it('lets the days of a person differ and every month come out a little different', () => {
		// the capped lead has to meet the cap to the minute, his months still add up exactly
		const capped = demo.flexBookings.find((booking) => booking.type === 'cap_forfeit')!.employeeId;
		for (const employee of demo.employees.filter((candidate) => candidate.id !== capped)) {
			const worked = new Map<string, number>();
			for (const { employeeId, startedAt, endedAt } of demo.entries) {
				if (employeeId !== employee.id || endedAt === null) continue;
				const workday = startedAt.slice(0, 10);
				const minutes = Temporal.Instant.from(startedAt).until(endedAt).total('minutes');
				worked.set(workday, (worked.get(workday) ?? 0) + minutes);
			}
			// overtime per worked day, a month summing to its drift exactly repeats the same figure
			const perDay = demo.monthClosings.flatMap(({ month, snapshot }) => {
				const figures = snapshot!.employees[employee.id];
				const days = [...worked.keys()].filter((date) => date.startsWith(month.slice(0, 7)));
				return figures && days.length > 0 ? [(figures.diffMinutes / days.length).toFixed(1)] : [];
			});
			expect(new Set(worked.values()).size, employee.lastName).toBeGreaterThanOrEqual(20);
			expect(new Set(perDay).size, employee.lastName).toBeGreaterThan(perDay.length / 2);
		}
	});
});
