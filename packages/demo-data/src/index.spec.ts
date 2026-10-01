import {
	add,
	aggregate,
	budgetStatus,
	fraction,
	invoiceForm,
	invoiceTotals,
	linesFromCells,
	parseDecimal,
	projectCoverage,
	roundDiv,
	roundingFor,
	taxTreatment,
	timerHint,
	toDecimal,
	vatRateFor,
	type EntrySpan,
	type ProjectEntry,
	type RoundingRule
} from '@zeit/rules';
import { invoiceLineSchema } from '@zeit/shared';
import { Temporal } from 'temporal-polyfill';
import { describe, expect, it } from 'vitest';
import { calendarFor, dateOf, TZ } from './calendar';
import { generateDemo, type DemoPlan, type PlanRow, type ProjectBook } from './index';
import { Random } from './random';
import { soloWorld } from './solo';

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

type Invoice = PlanRow<'invoices'>;

const apiRounding: RoundingRule = { incrementMinutes: 1, mode: 'nearest' };

function rebuilt(book: ProjectBook, invoice: Invoice) {
	const client = book.clients.find((candidate) => candidate.id === invoice.clientId)!;
	const booked = new Set(invoice.lines.flatMap((line) => line.entryIds));
	const cells = aggregate(
		book.projectEntries.flatMap((entry): ProjectEntry[] =>
			booked.has(entry.id)
				? [
						{
							id: entry.id,
							employeeId: entry.employeeId,
							clientId: client.id,
							projectId: entry.projectId,
							taskId: entry.taskId,
							workday: Temporal.PlainDate.from(localDay(entry.startedAt)),
							billable: true,
							start: Temporal.Instant.from(entry.startedAt),
							end: Temporal.Instant.from(entry.endedAt!)
						}
					]
				: []
		),
		{
			rates: book.rates
				.filter((rate) => rate.clientId === null || rate.clientId === client.id)
				.map((rate) => ({
					...rate,
					validFrom: Temporal.PlainDate.from(rate.validFrom),
					cents: BigInt(rate.rateCents)
				})),
			rounding: () =>
				roundingFor(
					apiRounding,
					{ incrementMinutes: client.roundingIncrementMin, mode: client.roundingMode },
					{ incrementMinutes: null, mode: null }
				).rule
		}
	);
	return linesFromCells(cells, taxTreatment(book.billingProfile, client));
}

const totalsOf = (invoice: Invoice) =>
	invoiceTotals(
		invoice.lines.map((line) => ({
			netCents: BigInt(line.netCents),
			taxCategory: line.taxCategory,
			taxRateBp: line.taxRateBp
		}))
	);

function formOf(book: ProjectBook, invoice: Invoice) {
	const profile = book.billingProfile;
	const client = book.clients.find((candidate) => candidate.id === invoice.clientId)!;
	return invoiceForm({
		kind: invoice.kind,
		format: invoice.format,
		grossCents: totalsOf(invoice).grossCents,
		treatment: taxTreatment(profile, client),
		isBusiness: client.isBusiness,
		profile: { hasVatId: profile.vatId !== null, hasTaxNumber: profile.taxNumber !== null },
		seller: profile,
		buyer: { ...client, leitwegId: client.buyerReference !== null }
	});
}

const vatDigitHolds = (vatId: string) => {
	let product = 10;
	for (const digit of vatId.slice(2, 10)) {
		product = (2 * ((Number(digit) + product) % 10 || 10)) % 11;
	}
	return (11 - product) % 10 === Number(vatId[10]);
};

const ibanHolds = (iban: string) =>
	BigInt(
		(iban.slice(4) + iban.slice(0, 4)).replace(/[A-Z]/g, (letter) =>
			String(letter.charCodeAt(0) - 55)
		)
	) %
		97n ===
	1n;

describe.each([
	{ workspace: 'company', book: plan as ProjectBook },
	{ workspace: 'solo', book: plan.solo as ProjectBook }
])('generateDemo invoices of the $workspace workspace', ({ book }) => {
	const clientOf = (invoice: Invoice) =>
		book.clients.find((client) => client.id === invoice.clientId)!;

	it('builds every time line the way linesFromCells does with the rounding of the api', () => {
		for (const invoice of book.invoices.filter((candidate) => candidate.kind === 'invoice')) {
			expect(
				invoice.lines.flatMap((line) =>
					line.kind === 'time'
						? [
								{
									projectId: line.projectId,
									taskId: line.taskId,
									serviceFrom: line.serviceFrom,
									serviceTo: line.serviceTo,
									minutes: line.minutes,
									rateCents: line.unitPriceCents,
									netCents: line.netCents,
									taxCategory: line.taxCategory,
									taxRateBp: line.taxRateBp,
									entryIds: line.entryIds
								}
							]
						: []
				)
			).toEqual(
				rebuilt(book, invoice).map((line) => ({
					...line,
					serviceFrom: line.serviceFrom.toString(),
					serviceTo: line.serviceTo.toString(),
					rateCents: Number(line.rateCents),
					netCents: Number(line.netCents)
				}))
			);
		}
	});

	it('adds up net, tax per rate and gross the way invoiceTotals does, a draft keeps zero like the api', () => {
		expect(
			book.invoices.filter((invoice) => {
				const totals = totalsOf(invoice);
				const sums =
					invoice.status === 'draft'
						? [0n, 0n, 0n]
						: [totals.netCents, totals.taxCents, totals.grossCents];
				return [invoice.netCents, invoice.taxCents, invoice.grossCents].join() !== sums.join();
			})
		).toEqual([]);
	});

	it('writes each line so that the invoice schema of the api takes it with its derivation', () => {
		const entries = new Map(book.projectEntries.map((entry) => [entry.id, entry]));
		expect(
			book.invoices
				.flatMap((invoice) => invoice.lines)
				.filter(
					(line) =>
						!invoiceLineSchema.safeParse({
							...line,
							quantityMilli: line.quantityMilli === null ? null : String(line.quantityMilli),
							unitPriceCents: String(line.unitPriceCents),
							netCents: String(line.netCents),
							derivation: line.derivation ?? { entries: [], rounding: null, rate: null }
						}).success ||
						(line.kind === 'time' &&
							(line.derivation?.entries.map((entry) => entry.id).join() !== line.entryIds.join() ||
								line.derivation.entries.some(
									(entry) =>
										entries.get(entry.id)?.startedAt !== entry.startedAt ||
										entries.get(entry.id)?.endedAt !== entry.endedAt
								) ||
								line.derivation.rate?.cents !== String(line.unitPriceCents) ||
								!line.derivation.rounding?.key.startsWith('billing.rounding.')))
				)
		).toEqual([]);
	});

	it('locks exactly the entries a draft or an uncancelled invoice was built from', () => {
		const held = book.invoices
			.filter((invoice) => invoice.kind === 'invoice' && invoice.status !== 'cancelled')
			.flatMap((invoice) =>
				invoice.lines.flatMap((line) => line.entryIds.map((id) => [id, invoice.id] as const))
			);
		expect(held.length).toBeGreaterThan(0);
		expect(new Set(held.map(([id]) => id)).size).toBe(held.length);
		const holders = new Map(held);
		expect(
			book.projectEntries.filter((entry) => entry.invoiceId !== (holders.get(entry.id) ?? null))
		).toEqual([]);
	});

	it('freezes the seller from the billing profile and the buyer from the client', () => {
		for (const invoice of book.invoices.filter((candidate) => candidate.status !== 'draft')) {
			expect(book.billingProfile).toMatchObject(invoice.seller!);
			expect(clientOf(invoice)).toMatchObject(invoice.buyer!);
		}
		expect(
			book.invoices.filter(
				(invoice) =>
					invoice.status === 'draft' && (invoice.seller !== null || invoice.buyer !== null)
			)
		).toEqual([]);
	});

	it('keeps the tax treatment of its client on every invoice, the cancellation included', () => {
		expect(
			book.invoices.filter(
				(invoice) => invoice.taxTreatment !== taxTreatment(book.billingProfile, clientOf(invoice))
			)
		).toEqual([]);
	});

	it('leaves none of the blockers the api checks before it issues', () => {
		expect(book.invoices.filter((invoice) => formOf(book, invoice).blockers.length > 0)).toEqual(
			[]
		);
	});

	it('carries everything xrechnung and zugferd need, with a vat id and iban no office or bank acts on', () => {
		const profile = book.billingProfile;
		expect(
			Object.entries(profile).filter(
				([key, value]) => value === null && !key.startsWith('register')
			)
		).toEqual([]);
		expect(profile.invoicePrefix).toBe('MUSTER-');
		expect(profile.contactEmail).toMatch(/\.example\.test$/);
		expect(ibanHolds(profile.iban!)).toBe(true);
		expect(profile.iban!.slice(4, 12)).toBe('00000000');
		expect(vatDigitHolds(profile.vatId!)).toBe(false);
	});
});

describe('generateDemo invoices of the solo workspace', () => {
	const { solo } = plan;
	const day = today.toString();
	const numbered = solo.invoices.filter((invoice) => invoice.number !== null);
	const nth = (seq: number) => numbered.find((invoice) => invoice.numberSeq === seq)!;
	const clientOf = (invoice: Invoice) =>
		solo.clients.find((client) => client.id === invoice.clientId)!;

	it('numbers MUSTER-2026-0001 to 0009 in the order of issue and stops the counter at 9', () => {
		expect(numbered.map((invoice) => invoice.number)).toEqual(
			Array.from({ length: 9 }, (_, i) => `MUSTER-2026-000${i + 1}`)
		);
		const dates = numbered.map((invoice) => invoice.issueDate!);
		expect(dates).toEqual(dates.toSorted());
		expect(solo.invoiceCounters).toEqual([{ year: 2026, lastSeq: 9 }]);
	});

	it('runs through every status and gets paid more than twice', () => {
		expect(new Set(solo.invoices.map((invoice) => invoice.status))).toEqual(
			new Set(['draft', 'issued', 'paid', 'cancelled'])
		);
		expect(numbered.filter((invoice) => invoice.status === 'paid').length).toBeGreaterThan(2);
	});

	it('cancels 0004 with 0005 to the cent and issues 0006 for the period it really covered', () => {
		const [wrong, cancellation, replacement] = [nth(4), nth(5), nth(6)];
		expect(wrong.status).toBe('cancelled');
		expect(wrong.cancelledAt).toBe(cancellation.issuedAt);
		expect(cancellation).toMatchObject({
			kind: 'cancellation',
			status: 'issued',
			refersToId: wrong.id,
			netCents: 0 - wrong.netCents,
			taxCents: 0 - wrong.taxCents,
			grossCents: 0 - wrong.grossCents
		});
		expect(
			cancellation.lines.map(({ minutes, unitPriceCents, netCents, entryIds }) => ({
				minutes,
				unitPriceCents,
				netCents,
				entryIds
			}))
		).toEqual(
			wrong.lines.map((line) => ({
				minutes: 0 - line.minutes!,
				unitPriceCents: line.unitPriceCents,
				netCents: 0 - line.netCents,
				entryIds: line.entryIds
			}))
		);
		expect(replacement.clientId).toBe(wrong.clientId);
		expect(replacement.lines.map((line) => line.entryIds)).toEqual(
			wrong.lines.map((line) => line.entryIds)
		);
		expect(replacement.grossCents).toBe(wrong.grossCents);
		const lastDay = wrong.lines
			.map((line) => line.serviceTo!)
			.toSorted()
			.at(-1)!;
		expect(wrong.serviceTo < lastDay).toBe(true);
		expect(replacement.serviceTo >= lastDay).toBe(true);
	});

	it('bills Studio Brandt in English under reverse charge, both vat ids on it and no tax', () => {
		const abroad = numbered.filter((invoice) => clientOf(invoice).countryCode !== 'DE');
		expect(abroad).toHaveLength(1);
		const studio = abroad[0]!;
		expect(studio.locale).toBe('en');
		expect(studio.introText).toMatch(/^thank you/);
		expect(
			studio.lines.filter((line) => line.taxCategory !== 'reverse_charge' || line.taxRateBp !== 0)
		).toEqual([]);
		expect([studio.taxCents, studio.grossCents]).toEqual([0, studio.netCents]);
		expect(studio.seller!.vatId).toMatch(/^DE\d{9}$/);
		expect(studio.buyer!.vatId).toMatch(/^NL\d{9}B\d{2}$/);
	});

	it('reaches all four clients, each in the format the app picks for it', () => {
		expect(
			new Set(numbered.map((invoice) => `${clientOf(invoice).name}: ${invoice.format}`))
		).toEqual(
			new Set([
				'Stadtwerke Lindental AöR (Beispiel): xrechnung',
				'Agentur Nordlicht GmbH (Beispiel): zugferd',
				'Studio Brandt B.V. (Beispiel): zugferd',
				'Martina Seidel (Beispiel): pdf'
			])
		);
		const consumer = numbered.find((invoice) => !clientOf(invoice).isBusiness)!;
		expect(formOf(solo, consumer).legalNotes).toContain('late_payment_286_consumer');
	});

	it('keeps the private invoice overdue and the one of the public client not yet due', () => {
		const open = numbered.filter(
			(invoice) => invoice.kind === 'invoice' && invoice.status === 'issued'
		);
		expect(
			open
				.filter((invoice) => invoice.dueDate! < day)
				.map((invoice) => clientOf(invoice).isBusiness)
		).toEqual([false]);
		expect(
			open.filter((invoice) => invoice.dueDate! > day).map((invoice) => invoice.format)
		).toEqual(['xrechnung']);
	});

	it('drafts the previous month of the agency, its time next to a hosting flat fee', () => {
		const drafts = solo.invoices.filter((invoice) => invoice.status === 'draft');
		expect(drafts).toHaveLength(1);
		const open = drafts[0]!;
		expect(clientOf(open).name).toMatch(/^Agentur/);
		expect([open.serviceFrom, open.serviceTo]).toEqual(['2026-08-01', '2026-08-31']);
		expect(open.lines.length).toBeGreaterThan(1);
		expect(open.lines.slice(0, -1).filter((line) => line.kind !== 'time')).toEqual([]);
		const fee = open.lines.at(-1)!;
		expect(fee).toMatchObject({
			kind: 'item',
			description: 'Hosting-Pauschale',
			position: open.lines.length,
			derivation: null,
			entryIds: []
		});
		expect(fee.netCents).toBe(
			Number(roundDiv(BigInt(fee.quantityMilli!) * BigInt(fee.unitPriceCents), 1000n))
		);
		expect(fee.taxRateBp).toBe(vatRateFor('standard', Temporal.PlainDate.from(open.serviceTo)));
	});
});

describe('generateDemo invoices of the office', () => {
	const hr = plan.users.find((user) => user.role === 'hr')!;

	it('bills two clients per half hour begun as Zeitgebühr, both paid', () => {
		expect(
			plan.invoices
				.filter((invoice) => invoice.number !== null)
				.map((invoice) => [invoice.number, invoice.status])
		).toEqual([
			['MUSTER-2026-0001', 'paid'],
			['MUSTER-2026-0002', 'paid']
		]);
		expect(plan.invoiceCounters).toEqual([{ year: 2026, lastSeq: 2 }]);
		expect(
			plan.invoices
				.flatMap((invoice) => invoice.lines)
				.filter(
					(line) =>
						!line.description.startsWith('Zeitgebühr nach § 13 StBVV: ') || line.minutes! % 30 !== 0
				)
		).toEqual([]);
		expect(new Set(plan.invoices.map((invoice) => invoice.clientId)).size).toBe(3);
	});

	it('leaves the hr persona a draft of last month to issue', () => {
		expect(
			plan.invoices
				.filter((invoice) => invoice.status === 'draft')
				.map((invoice) => [invoice.serviceFrom, invoice.serviceTo])
		).toEqual([['2026-08-01', '2026-08-31']]);
		expect(
			plan.invoices.filter(
				(invoice) =>
					invoice.createdBy !== hr.id || (invoice.issuedBy !== null && invoice.issuedBy !== hr.id)
			)
		).toEqual([]);
	});

	it('keeps the invoices of both workspaces to a few hundred rows', () => {
		const rows = [plan, plan.solo].flatMap((book) =>
			book.invoices.flatMap((invoice) => [
				invoice.id,
				...invoice.lines.flatMap((line) => [line.id, ...line.entryIds])
			])
		);
		expect(rows.length).toBeLessThan(800);
	});
});

describe('generateDemo invoices on other days', () => {
	const days = [
		...Array.from({ length: 12 }, (_, i) =>
			Temporal.PlainYearMonth.from({ year: 2026, month: i + 1 })
		).flatMap((month) => [
			month.toPlainDate({ day: 1 }).toString(),
			month.toPlainDate({ day: month.daysInMonth }).toString()
		]),
		'2026-01-02',
		'2026-01-15',
		'2026-01-16',
		'2028-02-29'
	];

	it.each(days)(
		'numbers, dates and dues the solo invoices inside the year of %s',
		(day) => {
			const date = Temporal.PlainDate.from(day);
			const { invoices, invoiceCounters } = soloWorld(new Random(7), calendarFor(date));
			const numbered = invoices.filter((invoice) => invoice.number !== null);
			expect(numbered.map((invoice) => invoice.number)).toEqual(
				Array.from({ length: 9 }, (_, i) => `MUSTER-${date.year}-000${i + 1}`)
			);
			expect(invoiceCounters).toEqual([{ year: date.year, lastSeq: 9 }]);
			const dates = numbered.map((invoice) => invoice.issueDate!);
			expect(dates).toEqual(dates.toSorted());
			const created = numbered.map(
				(invoice) => Temporal.Instant.from(invoice.createdAt).epochMilliseconds
			);
			expect(created).toEqual(created.toSorted((a, b) => a - b));
			expect(
				numbered.filter((invoice) => {
					const lastDay = invoice.lines
						.map((line) => line.serviceTo!)
						.toSorted()
						.at(-1)!;
					return (
						invoice.issueDate!.slice(0, 4) !== String(date.year) ||
						invoice.issueDate! > day ||
						lastDay >= invoice.issueDate! ||
						(invoice.paidOn !== null &&
							(invoice.paidOn < invoice.issueDate! || invoice.paidOn > day))
					);
				})
			).toEqual([]);
			expect(invoices.filter((invoice) => invoice.lines.length === 0)).toEqual([]);
			const open = numbered.filter(
				(invoice) => invoice.kind === 'invoice' && invoice.status === 'issued'
			);
			expect(open.filter((invoice) => invoice.dueDate! > day)).toHaveLength(1);
			expect(open.filter((invoice) => invoice.dueDate! < day)).toHaveLength(
				day.endsWith('-01-01') ? 0 : 1
			);
		},
		30_000
	);

	it.each([
		{ day: '2026-01-01', terms: 0 },
		{ day: '2026-01-02', terms: 0 },
		{ day: '2026-01-10', terms: 8 },
		{ day: '2026-01-16', terms: 14 }
	])(
		'issues the invoice meant to be overdue on 1 january with $terms days to pay on $day',
		({ day, terms }) => {
			const { invoices } = soloWorld(new Random(7), calendarFor(Temporal.PlainDate.from(day)));
			const unpaid = invoices.find((invoice) => invoice.numberSeq === 8)!;
			expect([unpaid.issueDate, unpaid.paymentTermsDays]).toEqual([
				`${day.slice(0, 4)}-01-01`,
				terms
			]);
		}
	);

	it('bills the city up to yesterday when its project has no time in the previous month', () => {
		const { invoices } = soloWorld(
			new Random(11),
			calendarFor(Temporal.PlainDate.from('2027-12-31'))
		);
		const city = invoices.find((invoice) => invoice.format === 'xrechnung')!;
		expect([city.serviceFrom, city.serviceTo, city.issueDate]).toEqual([
			'2027-11-01',
			'2027-12-30',
			'2027-12-31'
		]);
		expect(city.lines.filter((line) => line.serviceFrom! < '2027-12-01')).toEqual([]);
	});

	it('draws the same invoices from the same day and seed', () => {
		const calendar = calendarFor(today);
		expect(soloWorld(new Random(3), calendar).invoices).toEqual(
			soloWorld(new Random(3), calendar).invoices
		);
	});

	it.each(['2026-01-01', '2026-12-31'])(
		'bills the office inside the year of %s',
		(day) => {
			const demo = generateDemo({ today: Temporal.PlainDate.from(day), seed: 5 });
			const numbered = demo.invoices.filter((invoice) => invoice.number !== null);
			expect(numbered.map((invoice) => invoice.number)).toEqual([
				`MUSTER-${day.slice(0, 4)}-0001`,
				`MUSTER-${day.slice(0, 4)}-0002`
			]);
			expect(
				numbered.filter(
					(invoice) =>
						invoice.issueDate!.slice(0, 4) !== day.slice(0, 4) ||
						invoice.issueDate! > day ||
						invoice.serviceTo >= invoice.issueDate! ||
						invoice.paidOn! < invoice.issueDate! ||
						invoice.paidOn! > day
				)
			).toEqual([]);
			expect(demo.invoices.filter((invoice) => invoice.lines.length === 0)).toEqual([]);
		},
		30_000
	);
});
