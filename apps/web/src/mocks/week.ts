import {
	CalendarDateTime,
	getDayOfWeek,
	parseAbsolute,
	parseDate,
	startOfWeek,
	toCalendarDate,
	toZoned,
	today
} from '@internationalized/date';
import {
	ackFindingSchema,
	createCorrectionSchema,
	daysQuerySchema,
	weekdays,
	type Clock,
	type Correction,
	type Day,
	type DayRange,
	type ErrorCode,
	type FlexAccount,
	type HolidayCode,
	type TimeEntry
} from '@zeit/shared';
import { http, HttpResponse } from 'msw';
import type { z } from 'zod';
import { absenceOn } from './absences';

const employee = { id: '8d41b7c2-0e5f-4a93-b6d8-2c7e9f13a054', name: 'Mara Lenz' };
const user = { id: '3f6c2a9e-8b1d-4c57-9e0a-5d2b7f4a1c38', displayName: 'Mara Lenz' };
const katrin = { id: 'bb3deb4b-00e1-4c28-a4d6-de86c556bb22', displayName: 'Katrin Hölscher' };
const sabine = { id: '5b004527-423c-4b82-89ae-323b702a9c62', displayName: 'Sabine Kortmann' };

const zone = 'Europe/Berlin';
const TARGET = 468;
const CONTRACT_FROM = '2021-02-01';
const RULES = 'arbzg-1994';

const holidays: Record<string, [HolidayCode, 0.5 | 1]> = {
	'2026-01-01': ['new_year', 1],
	'2026-04-03': ['good_friday', 1],
	'2026-04-06': ['easter_monday', 1],
	'2026-05-01': ['labour_day', 1],
	'2026-05-14': ['ascension_day', 1],
	'2026-05-25': ['whit_monday', 1],
	'2026-06-04': ['corpus_christi', 1],
	'2026-10-03': ['german_unity_day', 1],
	'2026-11-01': ['all_saints_day', 1],
	'2026-12-24': ['christmas_eve', 0.5],
	'2026-12-25': ['christmas_day', 1],
	'2026-12-26': ['boxing_day', 1],
	'2026-12-31': ['new_years_eve', 0.5]
};

type Entry = Day['entries'][number];
type Finding = Day['findings'][number];
type Plan = [number, number, TimeEntry['source']?][];

const todayIso = () => today(zone).toString();
const addDays = (iso: string, days: number) => parseDate(iso).add({ days }).toString();
const weekdayOf = (iso: string) => weekdays[getDayOfWeek(parseDate(iso), 'de-DE')]!;

function at(date: string, minute: number) {
	const day = parseDate(date);
	const local = new CalendarDateTime(day.year, day.month, day.day).add({ minutes: minute });
	return toZoned(local, zone).toAbsoluteString();
}

const entryId = (date: string, index: number) =>
	`7a3c9e21-4b0d-4f6a-8c2e-${date.replaceAll('-', '')}${String(index).padStart(4, '0')}`;
const dateOfEntry = (id: string) => {
	const digits = id.slice(-12, -4);
	return `${digits.slice(0, 4)}-${digits.slice(4, 6)}-${digits.slice(6, 8)}`;
};

function usual(date: string): Plan {
	const n = Number(date.slice(8)) + Number(date.slice(5, 7)) * 3;
	const start = 450 + ((n * 7) % 35);
	const lunch = 720 + ((n * 11) % 40);
	const pause = 30 + ((n * 5) % 20);
	const worked = TARGET + ((n * 13) % 29) - 18;
	return [
		[start, lunch],
		[lunch + pause, start + worked + pause]
	];
}

const finding = (
	code: Finding['code'],
	severity: Finding['severity'],
	facts: Finding['facts']
): Finding => ({
	code,
	severity,
	ruleVersion: RULES,
	facts,
	explanation: { key: `arbzg.${code}`, params: facts },
	ack: null
});

function special(date: string) {
	const offset = parseDate(date).compare(parseDate(startOfWeek(today(zone), 'de-DE').toString()));
	switch (offset) {
		case -3:
			return { plan: [] as Plan, absence: 'vacation' as const };
		case -1:
			return { plan: [[600, 810]] as Plan, findings: [finding('ARBZG_9_SUNDAY', 'warning', {})] };
		case 1:
			return {
				plan: [
					[450, 720],
					[750, 1050]
				] as Plan,
				findings: [
					finding('ARBZG_3_OVER_8', 'info', { minutes: 570 }),
					finding('ARBZG_4_BREAK_SHORT', 'warning', { requiredMinutes: 45, actualMinutes: 30 })
				]
			};
		case 2:
			return {
				plan: [
					[545, 790],
					[835, 1040],
					[1215, 1360, 'correction']
				] as Plan,
				findings: [finding('ARBZG_3_OVER_8', 'info', { minutes: 595 })]
			};
		case 3:
			return {
				plan: null,
				findings: [finding('ARBZG_5_REST_UNDER_11H', 'warning', { restMinutes: 574 })]
			};
		default:
			return null;
	}
}

type Store = {
	today: Entry[];
	corrections: Correction[];
	acks: Map<string, Finding['ack']>;
};

let store: Store;

export function resetMockWeek() {
	const date = todayIso();
	const since = at(date, 8 * 60 + 14);
	const monday = startOfWeek(today(zone), 'de-DE').toString();
	store = {
		today:
			Date.parse(since) < Date.now()
				? [
						{
							id: entryId(date, 1),
							startedAt: since,
							endedAt: null,
							endReason: null,
							source: 'clock'
						}
					]
				: [],
		corrections: [
			{
				id: '4e8b1f3a-9c2d-4a7e-8b5f-1d3c6e9a2b47',
				employee,
				action: 'add',
				target: null,
				newStartedAt: at(addDays(monday, -5), 14 * 60),
				newEndedAt: at(addDays(monday, -5), 16 * 60 + 30),
				reason: 'Nachmittags beim Mandanten vor Ort, Stempeln vergessen.',
				status: 'pending',
				requestedBy: user,
				decidedBy: null,
				decidedAt: null,
				decisionNote: null,
				createdAt: at(addDays(monday, -4), 8 * 60 + 2)
			}
		],
		acks: new Map([
			[
				`${addDays(monday, -1)}|ARBZG_9_SUNDAY`,
				{
					at: at(monday, 9 * 60 + 12),
					by: katrin,
					note: 'Frist für den Jahresabschluss eines Mandanten, mit der Teamleitung abgesprochen.'
				}
			]
		])
	};
}

resetMockWeek();

const minutesOf = (entry: Entry, now: number) =>
	Math.round(
		((entry.endedAt ? Date.parse(entry.endedAt) : now) - Date.parse(entry.startedAt)) / 60_000
	);

export function entriesOf(date: string, employeeId = employee.id): Entry[] {
	const away = absenceOn(employeeId, date);
	if (away?.portion === 1) return [];
	if (date === todayIso()) return store.today;
	if (date > todayIso() || holidays[date]?.[1] === 1) return [];
	const day = special(date)?.plan ?? (['sat', 'sun'].includes(weekdayOf(date)) ? [] : usual(date));
	const plan = away ? day.slice(0, 1) : day;
	return plan.map(([from, to, source = 'clock'], i) => ({
		id: entryId(date, i + 1),
		startedAt: at(date, from),
		endedAt: at(date, to),
		endReason: i === plan.length - 1 ? 'leave' : 'break',
		source
	}));
}

const closedThrough = () =>
	parseDate(todayIso()).set({ day: 1 }).subtract({ months: 1, days: 1 }).toString();

function dayOf(date: string, employeeId = employee.id): Day {
	const now = Date.now();
	const entries = entriesOf(date, employeeId);
	const worked = entries.reduce((sum, entry) => sum + minutesOf(entry, now), 0);
	const breakMinutes = entries.slice(1).reduce((sum, entry, i) => {
		const before = entries[i]!;
		return before.endedAt
			? sum + Math.round((Date.parse(entry.startedAt) - Date.parse(before.endedAt)) / 60_000)
			: sum;
	}, 0);
	const holiday = holidays[date];
	const weekday = weekdayOf(date);
	const minutes = ['sat', 'sun'].includes(weekday) ? 0 : TARGET;
	const target = !holiday
		? {
				minutes,
				explanation: {
					key: 'target.workday',
					params: { weekday, minutes, validFrom: CONTRACT_FROM }
				}
			}
		: holiday[1] === 1
			? { minutes: 0, explanation: { key: 'target.holiday', params: { code: holiday[0] } } }
			: {
					minutes: minutes / 2,
					explanation: {
						key: 'target.half_holiday',
						params: { code: holiday[0], minutes: minutes / 2, validFrom: CONTRACT_FROM }
					}
				};
	const plan = special(date);
	const away = absenceOn(employeeId, date);
	let absence: Day['absence'] = null;
	if (away) {
		absence = { requestId: away.id, type: away.type, status: away.status, portion: away.portion };
	} else if (plan && 'absence' in plan) {
		absence = {
			requestId: '9d2e7c4b-1a3f-4e8d-b6c5-3f7a2e1d9c80',
			type: plan.absence,
			status: 'approved',
			portion: 1
		};
	}
	const credited = absence ? target.minutes * absence.portion : 0;
	const findings =
		!away && entries.length > 0 && plan && 'findings' in plan
			? plan.findings.map((found) => ({
					...found,
					ack: store.acks.get(`${date}|${found.code}`) ?? null
				}))
			: [];
	const future = date > todayIso();

	return {
		date,
		target,
		workedMinutes: worked,
		creditedMinutes: credited,
		diffMinutes: future ? 0 : worked + credited - target.minutes,
		breakMinutes,
		running: entries.some((entry) => entry.endedAt === null),
		entries,
		holiday: holiday ? { code: holiday[0], portion: holiday[1] } : null,
		absence,
		findings,
		locked: date <= closedThrough()
	};
}

function clockNow(): Clock {
	const now = Date.now();
	const base = {
		workday: todayIso(),
		workedMinutes: store.today.reduce((sum, entry) => sum + minutesOf(entry, now), 0)
	};
	const last = store.today.at(-1);
	if (last && !last.endedAt)
		return { state: 'working', ...base, entryId: last.id, since: last.startedAt };
	if (last?.endReason === 'break' && last.endedAt)
		return { state: 'on_break', ...base, since: last.endedAt };
	return { state: 'off', ...base };
}

const fail = (status: number, code: Exclude<ErrorCode, 'VALIDATION'>, message: string) =>
	HttpResponse.json({ code, message, details: null }, { status });

const invalid = (error: z.ZodError) =>
	HttpResponse.json(
		{
			code: 'VALIDATION',
			message: 'Invalid input',
			details: error.issues.map((issue) => ({
				field: issue.path.join('.'),
				code: issue.code,
				message: issue.message
			}))
		},
		{ status: 400 }
	);

function stampTo(state: Clock['state'][], change: (now: string) => void) {
	return () => {
		if (!state.includes(clockNow().state))
			return fail(409, 'INVALID_STATE', 'Clock is in another state');
		change(new Date().toISOString());
		return HttpResponse.json(clockNow());
	};
}

const open = (now: string) => {
	const date = todayIso();
	store.today.push({
		id: entryId(date, store.today.length + 1),
		startedAt: now,
		endedAt: null,
		endReason: null,
		source: 'clock'
	});
};

const close = (reason: 'break' | 'leave') => (now: string) => {
	const last = store.today.at(-1);
	if (last && !last.endedAt)
		store.today[store.today.length - 1] = { ...last, endedAt: now, endReason: reason };
};

function flexAccount(year: number): FlexAccount {
	const current = todayIso();
	const months =
		year < Number(current.slice(0, 4))
			? 12
			: year === Number(current.slice(0, 4))
				? Number(current.slice(5, 7))
				: 0;
	const diffs = [85, -40, 120, 15, -60, 45, -120, 180, 50];
	const closedMonth = closedThrough().slice(0, 7);
	let balance = 480;
	return {
		employeeId: employee.id,
		year,
		openingMinutes: 480,
		openingExplanation: { key: 'flex.opening.none', params: {} },
		balanceMinutes:
			480 +
			Array.from({ length: months }, (_, i) => diffs[i % diffs.length]!).reduce((a, b) => a + b, 0),
		asOf: year === Number(current.slice(0, 4)) ? current : `${year}-12-31`,
		cap: { plusMinutes: 2400, minusMinutes: 600, mode: 'warn' },
		months: Array.from({ length: months }, (_, i) => {
			const month = `${year}-${String(i + 1).padStart(2, '0')}`;
			const diff = diffs[i % diffs.length]!;
			balance += diff;
			return {
				month,
				targetMinutes: 21 * TARGET,
				workedMinutes: 21 * TARGET + diff,
				creditedMinutes: 0,
				bookedMinutes: 0,
				diffMinutes: diff,
				balanceMinutes: balance,
				closed: month <= closedMonth
			};
		}),
		bookings: [
			{
				id: '2b7d4e9a-6c1f-4a3b-9e8d-5c2a7f1b3e64',
				employeeId: employee.id,
				type: 'opening',
				minutes: 480,
				effectiveDate: `${year}-01-01`,
				reason: 'Saldo aus dem Vorjahr übernommen',
				monthClosingId: null,
				createdBy: sabine,
				createdAt: `${year}-01-02T07:30:00Z`
			}
		]
	};
}

export const weekHandlers = [
	http.get('/api/clock', () => HttpResponse.json(clockNow())),
	http.post('/api/clock/in', stampTo(['off'], open)),
	http.post('/api/clock/break', stampTo(['working'], close('break'))),
	http.post('/api/clock/resume', stampTo(['on_break'], open)),
	http.post('/api/clock/out', stampTo(['working', 'on_break'], close('leave'))),

	http.get('/api/employees/:id/days', ({ params, request }) => {
		const search = new URL(request.url).searchParams;
		const query = daysQuerySchema.safeParse({ from: search.get('from'), to: search.get('to') });
		if (!query.success) return invalid(query.error);
		const days: Day[] = [];
		for (let date = query.data.from; date <= query.data.to; date = addDays(date, 1))
			days.push(dayOf(date, String(params.id)));
		const sum = (pick: (day: Day) => number) => days.reduce((total, day) => total + pick(day), 0);
		return HttpResponse.json({
			employeeId: String(params.id),
			from: query.data.from,
			to: query.data.to,
			closedThrough: closedThrough(),
			days,
			totals: {
				targetMinutes: sum((day) => day.target.minutes),
				workedMinutes: sum((day) => day.workedMinutes),
				creditedMinutes: sum((day) => day.creditedMinutes),
				diffMinutes: sum((day) => day.diffMinutes)
			}
		} satisfies DayRange);
	}),

	http.get('/api/employees/:id/flex', ({ request }) =>
		HttpResponse.json(flexAccount(Number(new URL(request.url).searchParams.get('year'))))
	),

	http.get('/api/corrections', ({ request }) => {
		const search = new URL(request.url).searchParams;
		if ((search.get('scope') ?? 'mine') !== 'mine') return undefined;
		const statuses = search.getAll('status').flatMap((status) => status.split(','));
		const items = store.corrections.filter(
			(correction) => statuses.length === 0 || statuses.includes(correction.status)
		);
		return HttpResponse.json({ items, nextCursor: null });
	}),

	http.post('/api/corrections', async ({ request }) => {
		const parsed = createCorrectionSchema.safeParse(await request.json());
		if (!parsed.success) return invalid(parsed.error);
		const input = parsed.data;
		const date =
			input.action === 'void'
				? dateOfEntry(input.entryId)
				: toCalendarDate(parseAbsolute(input.startedAt, zone)).toString();
		if (date <= closedThrough()) return fail(409, 'PERIOD_LOCKED', 'Month is closed');
		const target =
			input.action === 'add' ? null : entriesOf(date).find((entry) => entry.id === input.entryId);
		if (target === undefined) return fail(404, 'NOT_FOUND', 'Time entry not found');
		const created: Correction = {
			id: crypto.randomUUID(),
			employee,
			action: input.action,
			target: target && {
				entryId: target.id,
				startedAt: target.startedAt,
				endedAt: target.endedAt
			},
			newStartedAt: input.action === 'void' ? null : input.startedAt,
			newEndedAt: input.action === 'void' ? null : input.endedAt,
			reason: input.reason,
			status: 'pending',
			requestedBy: user,
			decidedBy: null,
			decidedAt: null,
			decisionNote: null,
			createdAt: new Date().toISOString()
		};
		store.corrections.push(created);
		return HttpResponse.json(created, { status: 201 });
	}),

	http.post('/api/compliance/findings/ack', async ({ request }) => {
		const parsed = ackFindingSchema.safeParse(await request.json());
		if (!parsed.success) return invalid(parsed.error);
		const { employeeId, date, code, note } = parsed.data;
		if (employeeId === employee.id) {
			return fail(403, 'FORBIDDEN', 'Nobody acknowledges findings on their own times');
		}
		if (!dayOf(date, employeeId).findings.some((found) => found.code === code)) {
			return fail(404, 'NOT_FOUND', 'Finding not found');
		}
		const key = `${date}|${code}`;
		if (store.acks.has(key)) return fail(409, 'ALREADY_EXISTS', 'Finding is already acknowledged');
		store.acks.set(key, { at: new Date().toISOString(), by: user, note });
		return new HttpResponse(null, { status: 204 });
	})
];
