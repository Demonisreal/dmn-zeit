import { add, fraction, parseDecimal, toDecimal } from '@zeit/rules';
import { Temporal } from 'temporal-polyfill';
import { describe, expect, it } from 'vitest';
import { dateOf } from './calendar';
import { generateDemo, type DemoPlan, type PlanRow } from './index';

const today = Temporal.PlainDate.from('2026-09-24');
const plan = generateDemo({ today, seed: 7 });

const localDay = (stamp: string) => dateOf(Temporal.Instant.from(stamp)).toString();
const daysOf = (rows: readonly PlanRow<'vacationLedger'>[]) =>
	toDecimal(
		rows.reduce((sum, row) => add(sum, parseDecimal(row.days)), fraction(0)),
		2
	);

// what months.store counts as blocking: running entries, pending corrections and pending requests
function blockers(demo: DemoPlan, from: string, to: string) {
	const entries = new Map(demo.entries.map((entry) => [entry.id, entry]));
	return [
		...demo.entries.filter((entry) => entry.endedAt === null && localDay(entry.startedAt) <= to),
		...demo.corrections.filter((correction) => {
			const target =
				correction.targetEntryId === null ? undefined : entries.get(correction.targetEntryId);
			const days = [target?.startedAt, correction.newStartedAt].flatMap((stamp) =>
				stamp ? [localDay(stamp)] : []
			);
			return correction.status === 'pending' && days.some((day) => from <= day && day <= to);
		}),
		...demo.absences.filter(
			(absence) =>
				['pending', 'cancel_pending'].includes(absence.status) &&
				absence.startDate <= to &&
				absence.endDate >= from
		)
	];
}

describe('generateDemo', () => {
	it('builds the same sandbox from the same day and seed', () => {
		expect(generateDemo({ today, seed: 7 })).toEqual(plan);
		expect(generateDemo({ today, seed: 8 }).tenant.id).not.toBe(plan.tenant.id);
	}, 30_000);

	it('casts twelve people in three teams, each led by one of them', () => {
		expect(plan.employees).toHaveLength(12);
		expect(plan.teams).toHaveLength(3);
		for (const team of plan.teams) {
			expect(team.leadUserIds).toHaveLength(1);
			const lead = plan.users.find((user) => user.id === team.leadUserIds[0])!;
			const employee = plan.employees.find((candidate) => candidate.id === lead.employeeId)!;
			expect(lead.role).toBe('team_lead');
			expect(employee.teamId).toBe(team.id);
		}
		expect(plan.users.filter((user) => user.role === 'hr')).toHaveLength(1);
		expect(
			plan.users.filter((user) => user.role === 'admin' && user.employeeId === null)
		).toHaveLength(1);
	});

	it('moves one person from five to three days on 1 july', () => {
		const changes = plan.contracts.filter((contract) => contract.validFrom === '2026-07-01');
		expect(changes).toHaveLength(1);
		const [before, after] = plan.contracts
			.filter((contract) => contract.employeeId === changes[0]!.employeeId)
			.toSorted((a, b) => a.validFrom.localeCompare(b.validFrom));
		const workdays = (contract: PlanRow<'contracts'>) =>
			Object.values(contract.minutes).filter((minutes) => minutes > 0).length;
		expect([workdays(before!), before!.vacationBasisDays]).toEqual([5, 5]);
		expect([workdays(after!), after!.vacationBasisDays]).toEqual([3, 3]);
	});

	it('hires one person on 15 march and lets one go at the end of the month', () => {
		const hired = plan.employees.filter((employee) => employee.entryDate === '2026-03-15');
		const leaving = plan.employees.filter((employee) => employee.exitDate !== null);
		expect(hired).toHaveLength(1);
		expect(leaving.map((employee) => employee.exitDate)).toEqual(['2026-09-30']);
	});

	it('works a night through the change to summer time and another shift past midnight', () => {
		const night = plan.entries.find((entry) => entry.startedAt === '2026-03-28T22:00:00+01:00')!;
		expect(night.endedAt).toBe('2026-03-29T04:00:00+02:00');
		expect(Temporal.Instant.from(night.startedAt).until(night.endedAt!).total('minutes')).toBe(300);
		const pastMidnight = plan.entries.filter(
			(entry) =>
				entry !== night &&
				entry.endedAt !== null &&
				localDay(entry.startedAt) !== localDay(entry.endedAt)
		);
		expect(pastMidnight.length).toBeGreaterThan(0);
	});

	it('clocks the employee persona in today at ten past eight', () => {
		const running = plan.entries.filter((entry) => localDay(entry.startedAt) === '2026-09-24');
		expect(running).toHaveLength(1);
		expect(running[0]!.endedAt).toBeNull();
		expect(running[0]!.startedAt).toMatch(/^2026-09-24T08:1\d:\d\d\+02:00$/);
		const persona = plan.users.find((user) => user.employeeId === running[0]!.employeeId)!;
		expect(persona.role).toBe('employee');
	});

	it.each([
		{ day: '2026-09-24', demo: plan },
		// the story plays in the year before, today falls right behind the holidays
		{
			day: '2026-01-05',
			demo: generateDemo({ today: Temporal.PlainDate.from('2026-01-05'), seed: 11 })
		}
	])('books no time on a day the person is away, $day', ({ demo }) => {
		const away = demo.absences.filter((absence) =>
			['pending', 'approved', 'cancel_pending'].includes(absence.status)
		);
		expect(
			demo.entries.filter((entry) => {
				const days = [entry.startedAt, entry.endedAt ?? entry.startedAt].map(localDay);
				return away.some(
					(absence) =>
						absence.employeeId === entry.employeeId &&
						days.some((date) => absence.startDate <= date && date <= absence.endDate)
				);
			})
		).toEqual([]);
	});
});

describe('generateDemo month closings', () => {
	it('closes every month up to the one before last and leaves the previous one open', () => {
		expect(plan.monthClosings.map((closing) => closing.month)).toEqual([
			'2026-01-01',
			'2026-02-01',
			'2026-03-01',
			'2026-04-01',
			'2026-05-01',
			'2026-06-01',
			'2026-07-01'
		]);
		expect(plan.monthClosings.every((closing) => closing.action === 'close')).toBe(true);
		expect(blockers(plan, '2026-01-01', '2026-07-31')).toEqual([]);
		expect(blockers(plan, '2026-08-01', '2026-08-31')).toHaveLength(1);
	});

	it('lets the forgotten leave block the previous month when it happened there', () => {
		const early = generateDemo({ today: Temporal.PlainDate.from('2026-09-01'), seed: 7 });
		const correction = early.corrections.find((candidate) => candidate.status === 'pending')!;
		const target = early.entries.find((entry) => entry.id === correction.targetEntryId)!;
		expect(correction.reason).toMatch(/^Gehen vergessen/);
		expect(target.endedAt).toBeNull();
		expect(localDay(target.startedAt).slice(0, 7)).toBe('2026-08');
		expect(early.monthClosings.at(-1)!.month).toBe('2026-07-01');
		expect(blockers(early, '2026-08-01', '2026-08-31')).toHaveLength(2);
	}, 30_000);
});

describe('generateDemo requests', () => {
	const lead = (employeeId: string) => {
		const { teamId } = plan.employees.find((employee) => employee.id === employeeId)!;
		return plan.teams.find((team) => team.id === teamId)!.leadUserIds[0];
	};
	const lastYear = (employeeId: string) =>
		plan.vacationLedger.filter((row) => row.employeeId === employeeId && row.bucketYear === 2025);

	it('leaves two vacations, one time off, one correction and a refusal with the team lead', () => {
		const pending = plan.absences.filter((absence) => absence.status === 'pending');
		const corrections = plan.corrections.filter((correction) => correction.status === 'pending');
		const refused = plan.absences.filter((absence) => absence.status === 'rejected');
		expect(pending.filter((absence) => absence.type === 'vacation')).toHaveLength(2);
		expect(pending.filter((absence) => absence.type === 'time_off')).toHaveLength(1);
		expect(pending).toHaveLength(3);
		expect(corrections).toHaveLength(1);
		expect(corrections[0]!.reason).toMatch(/^Gehen vergessen/);
		expect(refused).toHaveLength(1);
		expect(refused[0]!.decisionNote).toBeTruthy();

		const inbox = [...pending, ...corrections, ...refused];
		expect(new Set(inbox.map((request) => lead(request.employeeId))).size).toBe(1);
		expect(refused[0]!.decidedBy).toBe(lead(refused[0]!.employeeId));
		const leadUser = plan.users.find((user) => user.id === lead(inbox[0]!.employeeId))!;
		expect(inbox.filter((request) => request.employeeId === leadUser.employeeId)).toEqual([]);
	});

	it('books through hr or admin, decides through the lead of the team, never on oneself', () => {
		const users = new Map(plan.users.map((user) => [user.id, user]));
		const office = (userId: string) => ['hr', 'admin'].includes(users.get(userId)!.role);
		const own = (userId: string, employeeId: string) =>
			users.get(userId)!.employeeId === employeeId;
		const books = (userId: string, employeeId: string) =>
			office(userId) && !own(userId, employeeId);
		const decides = (userId: string, employeeId: string) =>
			(office(userId) || lead(employeeId) === userId) && !own(userId, employeeId);

		expect(
			plan.flexBookings.filter(
				(row) => row.createdBy === null || !books(row.createdBy, row.employeeId)
			)
		).toEqual([]);
		expect(plan.monthClosings.filter((row) => !office(row.createdBy))).toEqual([]);
		expect(plan.vacationNotices.filter((row) => !office(row.sentBy))).toEqual([]);
		expect(
			plan.absences.filter(
				(row) =>
					(row.decidedBy !== null && !decides(row.decidedBy, row.employeeId)) ||
					(row.certificateConfirmedBy !== null &&
						!books(row.certificateConfirmedBy, row.employeeId))
			)
		).toEqual([]);
		expect(plan.findingAcks.filter((row) => !decides(row.createdBy, row.employeeId))).toEqual([]);
		// taken and refunded days carry the decision on the request, the jobs book without anyone
		expect(
			plan.vacationLedger.filter((row) =>
				row.createdBy === null
					? !['entitlement', 'expiry'].includes(row.entryType)
					: ['taken', 'refund_cancel'].includes(row.entryType)
						? !decides(row.createdBy, row.employeeId)
						: !books(row.createdBy, row.employeeId)
			)
		).toEqual([]);
	});

	it("lets last year's rest expire after the october notice", () => {
		const notice = plan.vacationNotices.find((candidate) => candidate.bucketYear === 2025)!;
		expect(notice.sentAt.slice(0, 7)).toBe('2025-10');
		expect(notice.deadline).toBe('2026-03-31');
		const expiry = lastYear(notice.employeeId).find((row) => row.entryType === 'expiry')!;
		expect(expiry.noticeId).toBe(notice.id);
		expect(expiry.effectiveDate).toBe('2026-03-31');
		expect(Number(expiry.days)).toBeLessThan(0);
		expect(daysOf(lastYear(notice.employeeId))).toBe('0.00');
	});

	it("keeps last year's rest of those who were never told", () => {
		const told = new Set(plan.vacationNotices.map((notice) => notice.employeeId));
		const untold = plan.vacationLedger.flatMap((row) =>
			row.bucketYear === 2025 && row.entryType === 'manual' && !told.has(row.employeeId)
				? [row.employeeId]
				: []
		);
		expect(untold.length).toBeGreaterThan(0);
		expect(
			untold.filter((employeeId) => lastYear(employeeId).some((row) => row.entryType === 'expiry'))
		).toEqual([]);
		expect(untold.some((employeeId) => daysOf(lastYear(employeeId)) !== '0.00')).toBe(true);
	});

	it('gives vacation days back for a confirmed sick note during the trip', () => {
		const refunds = plan.vacationLedger.filter((row) => row.entryType === 'refund_sick');
		expect(refunds.length).toBeGreaterThan(0);
		const trip = plan.absences.find((absence) => absence.id === refunds[0]!.absenceId)!;
		const sick = plan.absences.find(
			(absence) =>
				absence.type === 'sick' &&
				absence.employeeId === trip.employeeId &&
				absence.startDate <= trip.endDate &&
				trip.startDate <= absence.endDate
		)!;
		expect(sick.certificateConfirmedAt).not.toBeNull();
		const covered = plan.absenceDays.filter(
			(day) => day.absenceId === trip.id && sick.startDate <= day.date && day.date <= sick.endDate
		);
		expect(covered.length).toBeGreaterThan(0);
		expect(covered.every((day) => day.supersededBy === sick.id)).toBe(true);
		expect(daysOf(refunds.filter((row) => row.absenceId === trip.id))).toBe(
			toDecimal(
				covered.reduce((sum, day) => add(sum, parseDecimal(day.vacationDays)), fraction(0)),
				2
			)
		);
	});

	it('books a cancelled vacation back in full', () => {
		const cancelled = plan.absences.filter((absence) => absence.status === 'cancelled');
		expect(cancelled).toHaveLength(1);
		const rows = plan.vacationLedger.filter((row) => row.absenceId === cancelled[0]!.id);
		expect(new Set(rows.map((row) => row.entryType))).toEqual(new Set(['taken', 'refund_cancel']));
		expect(daysOf(rows)).toBe('0.00');
		const days = plan.absenceDays.filter((day) => day.absenceId === cancelled[0]!.id);
		expect(days.every((day) => day.supersededAt === cancelled[0]!.decidedAt)).toBe(true);
	});
});
