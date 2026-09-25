import {
	checkShifts,
	groupShifts,
	ruleSetFor,
	wholeMinutes,
	type ArbzgCode,
	type Span
} from '@zeit/rules';
import { Temporal } from 'temporal-polyfill';
import {
	clockTime,
	earlier,
	eachDay,
	endOfMonth,
	iso,
	lastWeekday,
	later,
	local,
	targetOn,
	TZ,
	weekdayFrom,
	type Calendar
} from './calendar';
import type { PlanRow } from './index';
import { isAway, type Leave } from './leave';
import type { Random } from './random';
import { leadOf, type Cast, type Person } from './staff';

export type Special = {
	person: Person;
	date: Temporal.PlainDate;
	// wall-clock minutes of that day, an end past 1440 runs into the next one
	spans: (readonly [number, number])[];
	// the last span is still running, its end is what the correction asks for
	running?: true;
};

export type Sheet = {
	entries: PlanRow<'entries'>[];
	// per workday, a running entry counted up to the end its correction asks for
	worked: Map<string, number>;
	// finished entries only, what the compliance check sees
	spans: Span[];
};

const NOTES: Record<ArbzgCode, string> = {
	ARBZG_3_OVER_8: 'Ausgleich im laufenden Halbjahr eingeplant',
	ARBZG_3_OVER_10: 'Fristende Jahresabschluss, mit der Teamleitung abgestimmt',
	ARBZG_4_BREAK_SHORT: 'Pause wegen Mandantentermin verkürzt, besprochen',
	ARBZG_4_CONTINUOUS_6H: 'Ohne Pause durchgearbeitet, Hinweis gegeben',
	ARBZG_5_REST_UNDER_11H: 'Abendtermin beim Mandanten, Ausnahme besprochen',
	ARBZG_9_SUNDAY: 'Fristsache, Ersatzruhetag in der Folgewoche',
	ARBZG_9_HOLIDAY: 'Abgabefrist, Ersatzruhetag vereinbart'
};

const works = (calendar: Calendar, person: Person, date: Temporal.PlainDate) =>
	targetOn(calendar, person.employment, date) > 0;

export function fixedShifts(cast: Cast, calendar: Calendar): Special[] {
	const { year } = calendar;
	const on = (month: number, day: number) => Temporal.PlainDate.from({ year, month, day });
	const next = (person: Person, from: Temporal.PlainDate, weekday: number) => {
		let date = weekdayFrom(from, weekday);
		while (!works(calendar, person, date)) date = date.add({ days: 7 });
		return date;
	};
	let evening = next(cast.lead, on(3, 9), 2);
	while (!works(calendar, cast.lead, evening.add({ days: 1 }))) {
		evening = next(cast.lead, evening.add({ days: 7 }), 2);
	}
	const march = Temporal.PlainYearMonth.from({ year, month: 3 });
	const corpusChristi = calendar.holidays.find(
		(holiday) => holiday.code === 'corpus_christi' && holiday.date.year === year
	)!;

	return [
		// 10 h 40 min with a proper break, only § 3
		{
			person: cast.busy,
			date: next(cast.busy, on(2, 16), 4),
			spans: [
				[450, 765],
				[810, 1135]
			]
		},
		// until 22:00 and back at 07:15, 9 h 15 min of rest
		{
			person: cast.lead,
			date: evening,
			spans: [
				[840, 1080],
				[1110, 1320]
			]
		},
		{
			person: cast.lead,
			date: evening.add({ days: 1 }),
			spans: [
				[435, 705],
				[735, 915]
			]
		},
		// 9 h 30 min with 30 min of break
		{
			person: cast.hr,
			date: next(cast.hr, on(4, 20), 2),
			spans: [
				[465, 750],
				[780, 1065]
			]
		},
		// 6 h 45 min in one go
		{ person: cast.partTimer, date: next(cast.partTimer, on(5, 6), 3), spans: [[480, 885]] },
		{
			person: cast.leaver,
			date: lastWeekday(Temporal.PlainYearMonth.from({ year, month: 2 }), 7),
			spans: [[600, 840]]
		},
		{ person: cast.forgetful, date: corpusChristi.date, spans: [[540, 780]] },
		// saturday 22:00 to sunday 04:00 over the change to summer time, five hours on the clock
		{
			person: cast.switcher,
			date: lastWeekday(march, 7).subtract({ days: 1 }),
			spans: [[1320, 1680]]
		},
		{
			person: cast.noticed,
			date: next(cast.noticed, on(6, 15), 5),
			spans: [
				[990, 1230],
				[1260, 1500]
			]
		}
	];
}

// these need the leave plan, they go on days the person is actually at work
export function lateShifts(
	rng: Random,
	cast: Cast,
	calendar: Calendar,
	leaves: readonly Leave[],
	fixed: readonly Special[]
): Special[] {
	const free = (person: Person, date: Temporal.PlainDate) =>
		works(calendar, person, date) &&
		!isAway(leaves, person, date) &&
		!fixed.some((special) => special.person === person && special.date.equals(date));
	const previous = eachDay(
		calendar.previous.toPlainDate({ day: 1 }),
		endOfMonth(calendar.previous)
	);
	const pick = (person: Person, weekday: number) =>
		previous.find((date) => date.day >= 8 && date.dayOfWeek === weekday && free(person, date)) ??
		previous.find((date) => free(person, date))!;

	let forgot = calendar.yesterday;
	while (!free(cast.forgetful, forgot)) forgot = forgot.subtract({ days: 1 });
	const arrival = cast.forgetful.arrival + rng.int(-10, 10);
	const morning = rng.int(200, 240);
	const pause = rng.int(30, 45);
	const leaving =
		arrival + pause + targetOn(calendar, cast.forgetful.employment, forgot) + cast.forgetful.drift;

	const early = pick(cast.capped, 5);
	const start = cast.capped.arrival + rng.int(-10, 10);
	// two hours short, this is what takes the capped lead from the cap down to 38 h
	const short = targetOn(calendar, cast.capped.employment, early) - 120;

	return [
		{
			person: cast.forgetful,
			date: forgot,
			spans: [
				[arrival, arrival + morning],
				[arrival + morning + pause, leaving]
			],
			running: true
		},
		{ person: cast.capped, date: early, spans: [[start, start + short]] },
		// 10 h 05 min in the open month, left unacknowledged
		{
			person: cast.busy,
			date: pick(cast.busy, 2),
			spans: [
				[460, 770],
				[815, 1110]
			]
		}
	];
}

// the capped lead builds the overtime up over the last closed quarter, so only that closing cuts it
function cappedDrift(calendar: Calendar, month: Temporal.PlainYearMonth): number {
	const back =
		(calendar.lastClosed.year - month.year) * 12 + calendar.lastClosed.month - month.month;
	return back === 0 ? 10 : back === 1 || back === 2 ? 6 : 0;
}

export function timesheets(
	rng: Random,
	cast: Cast,
	calendar: Calendar,
	specials: readonly Special[],
	leaves: readonly Leave[]
): Map<Person, Sheet> {
	const sheets = new Map<Person, Sheet>();
	// a story reaching back further than a year would open the steady drifters past the cap
	const driftFrom = calendar.today.subtract({ years: 1 });
	for (const person of cast.people) {
		const { entryDate, exitDate } = person.employment;
		const days = eachDay(
			later(calendar.start, entryDate),
			exitDate ? earlier(calendar.yesterday, exitDate) : calendar.yesterday
		);
		const own = new Map(
			specials
				.filter((special) => special.person === person)
				.map((special) => [special.date.toString(), special])
		);
		const ordinary = days.filter(
			(date) =>
				!own.has(date.toString()) && works(calendar, person, date) && !isAway(leaves, person, date)
		);
		const driftOn = (date: Temporal.PlainDate) =>
			person === cast.capped
				? cappedDrift(calendar, date.toPlainYearMonth())
				: Temporal.PlainDate.compare(date, driftFrom) > 0
					? person.drift
					: 0;
		// past the eight hours of § 3 an ordinary day would turn into a finding nobody wrote
		const spread = (date: Temporal.PlainDate) =>
			Math.min(
				20,
				ruleSetFor(date).limits.regularDailyMinutes -
					targetOn(calendar, person.employment, date) -
					driftOn(date)
			);

		// days paired at random cancel each other out, side by side the pattern would show
		const jitter = new Map<string, number>();
		const byMonth = new Map<string, Temporal.PlainDate[]>();
		for (const date of ordinary) {
			const month = date.toString().slice(0, 7);
			byMonth.set(month, [...(byMonth.get(month) ?? []), date]);
		}
		// the days left over let the months differ, 20 minutes off in all or the forgetful hits the minus cap
		let wander = 0;
		for (const month of byMonth.values()) {
			const shuffled = rng.shuffle(month);
			// the capped lead has to meet the cap to the minute, an odd day of his stays at zero
			const pairs = Math.floor(
				(person === cast.capped ? shuffled.length : shuffled.length - 1) / 2
			);
			for (let i = 0; i < pairs; i++) {
				const [a, b] = [shuffled[2 * i]!, shuffled[2 * i + 1]!];
				const reach = Math.min(spread(a), spread(b));
				const offset = rng.int(-reach, reach);
				jitter.set(a.toString(), offset);
				jitter.set(b.toString(), -offset);
			}
			for (const date of shuffled.slice(2 * pairs)) {
				const reach = person === cast.capped ? 0 : spread(date);
				const offset = rng.int(Math.max(-reach, -20 - wander), Math.min(reach, 20 - wander));
				jitter.set(date.toString(), offset);
				wander += offset;
			}
		}
		const ordinaryDays = new Set(ordinary.map((date) => date.toString()));

		const sheet: Sheet = { entries: [], worked: new Map(), spans: [] };
		for (const date of days) {
			const key = date.toString();
			const special = own.get(key);
			let spans = special?.spans;
			if (!spans && ordinaryDays.has(key)) {
				const minutes =
					targetOn(calendar, person.employment, date) + driftOn(date) + jitter.get(key)!;
				const arrival = person.arrival + rng.int(-12, 12);
				if (minutes <= 300) {
					spans = [[arrival, arrival + minutes]];
				} else {
					const morning = rng.int(200, 250);
					const pause = rng.int(30, 50);
					spans = [
						[arrival, arrival + morning],
						[arrival + morning + pause, arrival + pause + minutes]
					];
				}
			}
			if (!spans) continue;

			const instants = spans.map(([begin, end]) => ({
				start: local(date, begin),
				end: local(date, end)
			}));
			instants.forEach((span, i) => {
				const last = i === instants.length - 1;
				const open = last && special?.running === true;
				sheet.entries.push({
					id: rng.uuid(),
					employeeId: person.employee.id,
					startedAt: iso(span.start),
					endedAt: open ? null : iso(span.end),
					endReason: open ? null : last ? 'leave' : 'break',
					source: 'seed'
				});
				if (!open) sheet.spans.push(span);
			});
			sheet.worked.set(key, wholeMinutes(instants));
		}

		if (person === cast.worker) {
			sheet.entries.push({
				id: rng.uuid(),
				employeeId: person.employee.id,
				startedAt: iso(local(calendar.today, 490 + rng.int(0, 9), rng.int(0, 59))),
				endedAt: null,
				endReason: null,
				source: 'seed'
			});
		}
		sheets.set(person, sheet);
	}
	return sheets;
}

export function forgottenLeave(
	rng: Random,
	specials: readonly Special[],
	sheets: ReadonlyMap<Person, Sheet>
): PlanRow<'corrections'> {
	const special = specials.find((candidate) => candidate.running)!;
	const running = sheets.get(special.person)!.entries.find((entry) => entry.endedAt === null)!;
	const end = special.spans.at(-1)![1];
	return {
		id: rng.uuid(),
		employeeId: special.person.employee.id,
		action: 'change',
		targetEntryId: running.id,
		newStartedAt: running.startedAt,
		newEndedAt: iso(local(special.date, end)),
		reason: `Gehen vergessen, bin um ${clockTime(end)} Uhr gegangen.`,
		status: 'pending',
		requestedBy: special.person.user.id,
		decidedBy: null,
		decidedAt: null,
		createdAt: iso(local(special.date, 1210 + rng.int(0, 30)))
	};
}

// everything up to the last closed month is acknowledged, the open month keeps its findings
export function acknowledge(
	rng: Random,
	cast: Cast,
	calendar: Calendar,
	sheets: ReadonlyMap<Person, Sheet>
): PlanRow<'findingAcks'>[] {
	const acks: PlanRow<'findingAcks'>[] = [];
	for (const person of cast.people) {
		const findings = checkShifts(groupShifts(sheets.get(person)!.spans, TZ), {
			timeZone: TZ,
			holidays: calendar.holidays,
			range: { from: calendar.start, to: calendar.yesterday }
		});
		for (const finding of findings) {
			if (Temporal.PlainDate.compare(finding.date, calendar.closedThrough) > 0) continue;
			acks.push({
				id: rng.uuid(),
				employeeId: person.employee.id,
				workDate: finding.date.toString(),
				ruleCode: finding.code,
				ruleVersion: finding.ruleVersion,
				note: NOTES[finding.code],
				createdBy: leadOf(cast, person).id,
				createdAt: iso(local(finding.date.add({ days: 2 }), rng.int(540, 720)))
			});
		}
	}
	return acks;
}
