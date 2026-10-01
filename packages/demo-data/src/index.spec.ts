import {
	add,
	aggregate,
	budgetStatus,
	fraction,
	parseDecimal,
	projectCoverage,
	taxTreatment,
	timerHint,
	toDecimal,
	type EntrySpan,
	type ProjectEntry,
	type RoundingRule
} from '@zeit/rules';
import { Temporal } from 'temporal-polyfill';
import { describe, expect, it } from 'vitest';
import { dateOf, TZ } from './calendar';
import { generateDemo, type DemoPlan, type PlanRow, type ProjectBook } from './index';

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

// the budget as the api reads it: rounded minutes of billable cells, per person, task and day
function budgetStates(book: ProjectBook, rule: (projectId: string) => RoundingRule) {
	const projects = new Map(book.projects.map((project) => [project.id, project]));
	const cells = aggregate(
		book.projectEntries.flatMap((entry): ProjectEntry[] =>
			entry.endedAt === null
				? []
				: [
						{
							id: entry.id,
							employeeId: entry.employeeId,
							clientId: projects.get(entry.projectId)!.clientId,
							projectId: entry.projectId,
							taskId: entry.taskId,
							workday: Temporal.PlainDate.from(localDay(entry.startedAt)),
							billable: true,
							start: Temporal.Instant.from(entry.startedAt),
							end: Temporal.Instant.from(entry.endedAt)
						}
					]
		),
		{ rates: [], rounding: rule }
	);
	return book.projects.flatMap((project) => {
		if (project.budgetMinutes === null) return [];
		const used = cells
			.filter((cell) => cell.projectId === project.id)
			.reduce((sum, cell) => sum + cell.roundedMinutes, 0);
		return [budgetStatus(used, project.budgetMinutes).state];
	});
}

type Booked = { employeeId: string; startedAt: string; endedAt: string | null };

const byDay = <Row extends Booked>(rows: readonly Row[]) => {
	const days = new Map<string, Row[]>();
	for (const row of rows) {
		const key = `${row.employeeId} ${localDay(row.startedAt)}`;
		days.set(key, [...(days.get(key) ?? []), row]);
	}
	return days;
};

const spanOf = (row: Booked): EntrySpan => ({
	start: Temporal.Instant.from(row.startedAt),
	end: row.endedAt === null ? null : Temporal.Instant.from(row.endedAt)
});

describe('generateDemo projects of the office', () => {
	const morning = Temporal.ZonedDateTime.from(`${today}T09:00[${TZ}]`).toInstant();
	const running = plan.projectEntries.filter((entry) => entry.endedAt === null);
	const shift = plan.entries.find(
		(entry) => entry.endedAt === null && localDay(entry.startedAt) === today.toString()
	)!;

	it('works for six made-up clients, each billed per half hour begun', () => {
		expect(plan.clients).toHaveLength(6);
		expect(plan.clients.filter((client) => !client.name.endsWith('(Beispiel)'))).toEqual([]);
		expect(
			plan.clients.filter(
				(client) => client.roundingIncrementMin !== 30 || client.roundingMode !== 'up'
			)
		).toEqual([]);
	});

	it('prices with a default rate, rates per client and a senior rate on one project', () => {
		const levels = plan.rates.map((rate) =>
			rate.projectId !== null && rate.employeeId !== null
				? 'project_employee'
				: rate.clientId !== null
					? 'client'
					: 'default'
		);
		expect(new Set(levels)).toEqual(new Set(['default', 'client', 'project_employee']));
	});

	it('brings one closing near its budget and another beyond it', () => {
		const rule = (projectId: string): RoundingRule => {
			const { clientId } = plan.projects.find((project) => project.id === projectId)!;
			const client = plan.clients.find((candidate) => candidate.id === clientId)!;
			return { incrementMinutes: client.roundingIncrementMin!, mode: client.roundingMode! };
		};
		expect(budgetStates(plan, rule).sort()).toEqual(['exceeded', 'warn']);
	});

	it('leaves some of the stamped time without project', () => {
		const booked = byDay(plan.projectEntries);
		const from = [...booked.keys()].map((key) => key.split(' ')[1]!).sort()[0]!;
		let worked = 0;
		let unassigned = 0;
		for (const [key, entries] of byDay(plan.entries)) {
			if (key.split(' ')[1]! < from || key.endsWith(today.toString())) continue;
			const coverage = projectCoverage((booked.get(key) ?? []).map(spanOf), entries.map(spanOf), {
				now: morning,
				timeZone: TZ
			});
			worked += coverage.workedMinutes;
			unassigned += coverage.unassignedMinutes;
		}
		expect(unassigned / worked).toBeGreaterThan(0.04);
		expect(unassigned / worked).toBeLessThan(0.11);
	});

	it('shows the coverage hints on three days of the story and nowhere else', () => {
		const worked = byDay(plan.entries);
		const hinted = [...byDay(plan.projectEntries)].flatMap(([key, entries]) => {
			const { hints } = projectCoverage(entries.map(spanOf), (worked.get(key) ?? []).map(spanOf), {
				now: morning,
				timeZone: TZ
			});
			return hints.length > 0 ? [{ key, hints }] : [];
		});
		const lastShift = plan.entries.findLast(
			(entry) => entry.employeeId === shift.employeeId && entry.endedAt !== null
		)!;
		const forgotten = running.find((entry) => entry.employeeId !== shift.employeeId)!;
		const saturday = plan.projectEntries.find(
			(entry) => Temporal.PlainDate.from(localDay(entry.startedAt)).dayOfWeek === 6
		)!;
		const keyOf = (row: Booked) => `${row.employeeId} ${localDay(row.startedAt)}`;

		expect(hinted.map(({ key }) => key).sort()).toEqual(
			[keyOf(lastShift), keyOf(forgotten), keyOf(saturday)].sort()
		);
		expect(
			hinted.filter(
				({ hints }) =>
					!hints.includes('PROJECT_OVER_WORKED') || !hints.includes('PROJECT_OUTSIDE_WORK')
			)
		).toEqual([]);
		expect(worked.get(keyOf(saturday))).toBeUndefined();
	});

	it('runs the timer of the employee persona since shortly after she clocked in', () => {
		const own = running.filter((entry) => entry.employeeId === shift.employeeId);
		expect(own).toHaveLength(1);
		const late = Temporal.Instant.from(shift.startedAt).until(own[0]!.startedAt).total('minutes');
		expect(late).toBeGreaterThanOrEqual(2);
		expect(late).toBeLessThan(7);
	});

	it('leaves a colleague of the same team with a timer running since yesterday afternoon', () => {
		const forgotten = running.filter((entry) => entry.employeeId !== shift.employeeId);
		expect(forgotten).toHaveLength(1);
		expect(forgotten[0]!.startedAt).toMatch(/T16:40:00\+0[12]:00$/);
		expect(timerHint(Temporal.Instant.from(forgotten[0]!.startedAt), morning)).toBe(true);
		const teamOf = (employeeId: string) =>
			plan.employees.find((employee) => employee.id === employeeId)!.teamId;
		expect(teamOf(forgotten[0]!.employeeId)).toBe(teamOf(shift.employeeId));
	});

	it('keeps both timers off the budgeted projects', () => {
		const budgeted = new Set(
			plan.projects.filter((project) => project.budgetMinutes !== null).map((project) => project.id)
		);
		expect(running.filter((entry) => budgeted.has(entry.projectId))).toEqual([]);
	});
});

describe('generateDemo solo workspace', () => {
	const { solo } = plan;

	it('marks the freelancer and her clients as made up', () => {
		expect(solo.tenant.name).toMatch(/\(Beispiel\)$/);
		expect(solo.clients.filter((client) => !client.name.endsWith('(Beispiel)'))).toEqual([]);
		expect(solo.employee.personnelNo).toBe('1');
	});

	it('works for an agency, a public client, a client abroad and a private person', () => {
		const leitweg = solo.clients.filter((client) => client.buyerReference !== null);
		expect(leitweg).toHaveLength(1);
		const id = leitweg[0]!.buyerReference!;
		expect(id).toMatch(/^\d{2,12}(-[A-Z0-9]{1,30})?-\d{2}$/);
		// mod 97-10 like the iban, letters count from A = 10
		const digits = id
			.replaceAll('-', '')
			.replace(/[A-Z]/g, (letter) => String(letter.charCodeAt(0) - 55));
		expect(BigInt(digits) % 97n).toBe(1n);

		const abroad = solo.clients.filter((client) => client.countryCode !== 'DE');
		expect(abroad).toHaveLength(1);
		expect(taxTreatment({ taxProfile: 'regular' }, abroad[0]!)).toBe('reverse_charge');
		expect(abroad[0]!.invoiceLocale).toBe('en');

		expect(solo.clients.filter((client) => !client.isBusiness)).toHaveLength(1);
		expect(solo.clients.filter((client) => client.name.startsWith('Agentur'))).toHaveLength(1);
	});

	it('brings one project near its budget and another beyond it, whatever the rounding', () => {
		const rules: RoundingRule[] = [
			{ incrementMinutes: 1, mode: 'nearest' },
			{ incrementMinutes: 15, mode: 'up' }
		];
		for (const rule of rules) {
			expect(budgetStates(solo, () => rule).sort()).toEqual(['exceeded', 'warn']);
		}
	});

	it('books quarter hours since the start of the year, with a task where the project has any', () => {
		const finished = solo.projectEntries.filter((entry) => entry.endedAt !== null);
		const quarter = (stamp: string) => /:(00|15|30|45):00\+0[12]:00$/.test(stamp);
		expect(
			finished.filter((entry) => !quarter(entry.startedAt) || !quarter(entry.endedAt!))
		).toEqual([]);
		expect(localDay(finished[0]!.startedAt).slice(0, 7)).toBe(`${today.year}-01`);
		const withTasks = new Set(solo.tasks.map((task) => task.projectId));
		expect(
			finished.filter((entry) => withTasks.has(entry.projectId) && entry.taskId === null)
		).toEqual([]);
	});

	it('runs her timer since half past eight today', () => {
		const running = solo.projectEntries.filter((entry) => entry.endedAt === null);
		expect(running).toHaveLength(1);
		expect(running[0]!.startedAt).toMatch(/^2026-09-24T08:3\d:\d\d\+02:00$/);
	});
});

describe('generateDemo projects on other days', () => {
	it.each([
		{ day: '2026-01-05', seed: 11 },
		{ day: '2026-07-31', seed: 3107 },
		{ day: '2026-09-01', seed: 7 }
	])(
		'keeps budgets and timers on $day',
		({ day, seed }) => {
			const demo = generateDemo({ today: Temporal.PlainDate.from(day), seed });
			const halfHours = (): RoundingRule => ({ incrementMinutes: 30, mode: 'up' });
			const quarters = (): RoundingRule => ({ incrementMinutes: 15, mode: 'up' });

			expect(budgetStates(demo, halfHours).sort()).toEqual(['exceeded', 'warn']);
			expect(budgetStates(demo.solo, quarters).sort()).toEqual(['exceeded', 'warn']);
			expect(demo.projectEntries.filter((entry) => entry.endedAt === null)).toHaveLength(2);
			expect(demo.solo.projectEntries.filter((entry) => entry.endedAt === null)).toHaveLength(1);
		},
		30_000
	);
});
