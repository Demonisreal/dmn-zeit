import {
	createAbsenceSchema,
	type Absence,
	type AbsencePreview,
	type AbsenceStatus,
	type AbsenceType,
	type Correction,
	type ErrorCode,
	type Holiday,
	type TeamCalendar,
	type VacationAccount,
	type VacationBucket,
	type VacationLedgerEntry
} from '@zeit/shared';
import { http, HttpResponse } from 'msw';
import { teamIds } from './hr';

// sample company for working on the ui without the api: a tax office in NRW, names made up
const person = (id: string, userId: string, name: string) => ({
	id,
	name,
	user: { id: userId, displayName: name }
});

// same person as mockSession in handlers.ts
const mara = person(
	'8d41b7c2-0e5f-4a93-b6d8-2c7e9f13a054',
	'3f6c2a9e-8b1d-4c57-9e0a-5d2b7f4a1c38',
	'Mara Lenz'
);
const deniz = person(
	'bc1e61b4-d3d8-4290-9124-bc7adf87efde',
	'9e54ff3b-ee67-48c7-8424-9364dabd4b90',
	'Deniz Aydın'
);
const jonas = person(
	'f4fa8137-2571-4add-ba96-add65c1f7104',
	'30593c7c-95be-42e3-a23b-060f9bab7fa0',
	'Jonas Brandt'
);
const lea = person(
	'60f75051-d386-4bd1-912a-74a882f967e8',
	'7d6baf86-75ed-4897-9ed1-61587ad9e279',
	'Lea Schwerdtfeger'
);
const tobias = person(
	'09cbac3e-5b5a-474e-9654-f777b63fddad',
	'07365063-3384-4eeb-a446-a1eab9b8b24c',
	'Tobias Kämmerer'
);
const katrin = person(
	'2cfefd95-d735-4202-bf6e-eaaaaef60f62',
	'bb3deb4b-00e1-4c28-a4d6-de86c556bb22',
	'Katrin Hölscher'
);
const frank = person(
	'16755866-32a5-453d-9d32-8e69c26b1712',
	'0ad3ed76-7ec4-4d71-9999-0637e56804dc',
	'Frank Oberdiek'
);
const helin = person(
	'67d6b390-2fd7-4f0f-8a3d-f855b253283f',
	'6d072ca6-2c26-47f3-b618-69da9b9a1ac3',
	'Helin Demir'
);
const sabine = { id: '5b004527-423c-4b82-89ae-323b702a9c62', displayName: 'Sabine Kortmann' };

// the teams themselves come from mocks/hr.ts, which also answers GET /api/teams
const members: Record<string, (typeof mara)[]> = {
	[teamIds.tax]: [katrin, mara, deniz, jonas, lea, tobias],
	[teamIds.payroll]: [frank, helin],
	[teamIds.books]: []
};

const holidays: Holiday[] = [
	...['2025-01-01', '2026-01-01', '2027-01-01'].map((date) => ({
		date,
		code: 'new_year' as const,
		portion: 1 as const
	})),
	{ date: '2026-04-03', code: 'good_friday', portion: 1 },
	{ date: '2026-04-06', code: 'easter_monday', portion: 1 },
	{ date: '2026-05-01', code: 'labour_day', portion: 1 },
	{ date: '2026-05-14', code: 'ascension_day', portion: 1 },
	{ date: '2026-05-25', code: 'whit_monday', portion: 1 },
	{ date: '2026-06-04', code: 'corpus_christi', portion: 1 },
	{ date: '2026-10-03', code: 'german_unity_day', portion: 1 },
	{ date: '2026-11-01', code: 'all_saints_day', portion: 1 },
	{ date: '2026-12-24', code: 'christmas_eve', portion: 0.5 },
	{ date: '2026-12-25', code: 'christmas_day', portion: 1 },
	{ date: '2026-12-26', code: 'boxing_day', portion: 1 },
	{ date: '2026-12-31', code: 'new_years_eve', portion: 0.5 }
];

const DAY_MS = 86_400_000;
// 39 hours over five days
const DAY_MINUTES = 468;

const addDays = (iso: string, days: number) =>
	new Date(Date.parse(iso) + days * DAY_MS).toISOString().slice(0, 10);

const daysBetween = (from: string, to: string) => {
	const dates: string[] = [];
	for (let date = from; date <= to; date = addDays(date, 1)) dates.push(date);
	return dates;
};

const isWeekend = (iso: string) => [0, 6].includes(new Date(iso).getUTCDay());
const toDays = (n: number) => n.toFixed(2);

type Range = Pick<Absence, 'type' | 'startDate' | 'endDate' | 'halfDayStart' | 'halfDayEnd'>;

function costOf(range: Range): AbsencePreview['days'] {
	return daysBetween(range.startDate, range.endDate).map((date) => {
		const holiday = holidays.find((day) => day.date === date);
		const off = (key: string, params: Record<string, string> = {}) => ({
			date,
			portion: 0 as const,
			targetMinutes: 0,
			vacationDays: '0.00',
			explanation: { key, params }
		});
		if (holiday?.portion === 1) return off('vacation.day.holiday', { code: holiday.code });
		if (isWeekend(date)) return off('vacation.day.non_working_day');
		const half =
			holiday?.portion === 0.5 ||
			(range.halfDayStart && date === range.startDate) ||
			(range.halfDayEnd && date === range.endDate);
		const portion = half ? 0.5 : 1;
		return {
			date,
			portion,
			targetMinutes: DAY_MINUTES * portion,
			vacationDays: range.type === 'vacation' ? toDays(portion) : '0.00',
			explanation: holiday
				? { key: 'vacation.day.half_holiday', params: { code: holiday.code } }
				: { key: 'vacation.day.workday', params: { portion } }
		};
	});
}

const sum = (days: AbsencePreview['days'], pick: (day: AbsencePreview['days'][number]) => number) =>
	days.reduce((total, day) => total + pick(day), 0);

type Extra = Partial<Omit<Absence, 'id' | 'employee' | 'type' | 'startDate' | 'endDate'>>;

function absence(
	id: string,
	who: typeof mara,
	type: AbsenceType,
	startDate: string,
	endDate: string,
	status: AbsenceStatus,
	extra: Extra = {}
): Absence {
	const range = {
		type,
		startDate,
		endDate,
		halfDayStart: extra.halfDayStart ?? false,
		halfDayEnd: extra.halfDayEnd ?? false
	};
	const days = costOf(range);
	return {
		id,
		employee: { id: who.id, name: who.name },
		...range,
		status,
		note: null,
		vacationDays: toDays(sum(days, (day) => Number(day.vacationDays))),
		targetMinutes: sum(days, (day) => day.targetMinutes),
		requestedBy: who.user,
		decidedBy: status === 'pending' || type === 'sick' ? null : katrin.user,
		decidedAt:
			status === 'pending' || type === 'sick' ? null : `${addDays(startDate, -20)}T08:14:00Z`,
		decisionNote: null,
		sickNote: null,
		createdAt: `${addDays(startDate, type === 'sick' ? 0 : -24)}T06:52:00Z`,
		...extra
	};
}

const seedAbsences = (): Absence[] => [
	absence(
		'ebec627f-3839-4ae4-9f7e-fd73b1be896e',
		mara,
		'vacation',
		'2026-01-05',
		'2026-01-06',
		'approved'
	),
	absence(
		'68662c67-228a-4057-b450-5a9033ddc871',
		mara,
		'vacation',
		'2026-04-07',
		'2026-04-10',
		'approved'
	),
	absence(
		'33ea092a-8440-40fd-9ce9-188da70808e2',
		mara,
		'vacation',
		'2026-06-22',
		'2026-07-03',
		'approved'
	),
	absence(
		'bd2d51f0-740c-4e54-a84b-8f66724b1015',
		mara,
		'sick',
		'2026-06-24',
		'2026-06-24',
		'approved',
		{
			sickNote: { confirmedAt: '2026-06-29T07:31:00Z', confirmedBy: sabine }
		}
	),
	absence(
		'ba5f4222-d8df-48b2-a79a-d87a724217c7',
		mara,
		'time_off',
		'2026-08-14',
		'2026-08-14',
		'approved',
		{
			halfDayStart: true
		}
	),
	absence(
		'3674db36-4022-4f00-8d9c-203b18e48320',
		mara,
		'sick',
		'2026-09-21',
		'2026-09-23',
		'approved'
	),
	absence(
		'ff7f7ebd-9c20-4063-b6f1-da358986331b',
		mara,
		'vacation',
		'2026-10-12',
		'2026-10-14',
		'pending',
		{
			note: 'Herbstferien, die Kita ist geschlossen.'
		}
	),
	absence(
		'd145fce9-6961-42ec-b912-d1260066ef3b',
		mara,
		'vacation',
		'2026-11-02',
		'2026-11-06',
		'withdrawn',
		{
			decidedBy: null,
			decidedAt: null
		}
	),
	absence(
		'8dc8ceb2-5fd6-43e9-93f0-6b4de7d61805',
		mara,
		'vacation',
		'2026-12-21',
		'2026-12-23',
		'approved'
	),
	absence(
		'10332fc2-5701-4508-b1fe-450c736b7b02',
		mara,
		'vacation',
		'2026-12-28',
		'2026-12-30',
		'rejected',
		{
			decisionNote:
				'Zum Jahreswechsel laufen die Abschlüsse für die Mandanten. Bitte in die zweite Januarwoche legen.'
		}
	),
	absence(
		'c5778ec6-b907-4267-9a0f-00c51008acfc',
		deniz,
		'vacation',
		'2026-09-07',
		'2026-09-11',
		'approved'
	),
	absence(
		'a9a94266-8d57-4e72-9733-6c33f9602021',
		deniz,
		'vacation',
		'2026-10-19',
		'2026-10-30',
		'pending',
		{
			note: 'Herbstferien mit den Kindern.'
		}
	),
	absence(
		'f26bc2f9-431a-4abb-ae70-614901a724cf',
		jonas,
		'vacation',
		'2026-09-28',
		'2026-09-30',
		'approved'
	),
	absence(
		'620e2788-03dd-436e-b30f-24d1871755f9',
		jonas,
		'time_off',
		'2026-10-02',
		'2026-10-02',
		'pending'
	),
	absence(
		'7b244a8b-8efb-4745-8476-807fa26b8d0b',
		lea,
		'vacation',
		'2026-11-23',
		'2026-11-24',
		'pending',
		{
			halfDayEnd: true
		}
	),
	absence(
		'ceebeb1e-31f9-4f7c-8640-a2bdb5145348',
		tobias,
		'vacation',
		'2026-10-05',
		'2026-10-09',
		'cancel_pending',
		{
			note: 'Umzug ist verschoben, bitte stornieren.'
		}
	),
	absence(
		'cf3a57aa-1e58-4fec-885e-1ff4f80ff309',
		tobias,
		'sick',
		'2026-09-21',
		'2026-09-25',
		'approved'
	),
	absence(
		'f33be8c9-84cd-4748-9bc0-54b977a01cac',
		katrin,
		'vacation',
		'2026-10-05',
		'2026-10-06',
		'approved',
		{
			decidedBy: sabine
		}
	),
	absence(
		'57724abe-56f2-45aa-aa2d-4b9d04d801df',
		frank,
		'vacation',
		'2026-09-14',
		'2026-09-25',
		'approved',
		{
			decidedBy: sabine
		}
	),
	absence(
		'846acc38-0ec0-4a44-882e-b12086341c00',
		helin,
		'sick',
		'2026-09-23',
		'2026-09-24',
		'approved'
	),
	absence(
		'2620d067-b44f-48ba-b055-8aab5c99ca02',
		helin,
		'vacation',
		'2026-10-26',
		'2026-10-30',
		'pending'
	)
];

const correction = (
	id: string,
	who: typeof mara,
	fields: Pick<Correction, 'action' | 'target' | 'newStartedAt' | 'newEndedAt' | 'reason'>,
	createdAt: string
): Correction => ({
	id,
	employee: { id: who.id, name: who.name },
	...fields,
	status: 'pending',
	requestedBy: who.user,
	decidedBy: null,
	decidedAt: null,
	decisionNote: null,
	createdAt
});

const seedCorrections = (): Correction[] => [
	correction(
		'1c771feb-533e-4e02-98af-e6c64e9b1025',
		jonas,
		{
			action: 'change',
			target: {
				entryId: 'ec991b17-9d36-4e23-b371-2c2f578e2720',
				startedAt: '2026-09-22T06:03:00Z',
				endedAt: null
			},
			newStartedAt: '2026-09-22T06:03:00Z',
			newEndedAt: '2026-09-22T14:41:00Z',
			reason: 'Gehen vergessen, war bis 16:40 beim Mandanten im Termin.'
		},
		'2026-09-23T05:58:00Z'
	),
	correction(
		'b021c8c6-e31a-4a83-8911-725bcc0add75',
		lea,
		{
			action: 'add',
			target: null,
			newStartedAt: '2026-09-18T11:30:00Z',
			newEndedAt: '2026-09-18T15:15:00Z',
			reason: 'Nachmittag bei der Betriebsprüfung vor Ort, Stempeln vergessen.'
		},
		'2026-09-21T07:20:00Z'
	),
	correction(
		'1b590733-73ab-4754-9657-6aa513c8b8b5',
		deniz,
		{
			action: 'void',
			target: {
				entryId: '434fa1ae-a574-44d4-8d3d-0fdac5a5dc36',
				startedAt: '2026-09-17T10:31:00Z',
				endedAt: '2026-09-17T10:33:00Z'
			},
			newStartedAt: null,
			newEndedAt: null,
			reason: 'Doppelt eingestempelt, die zweite Buchung ist zu viel.'
		},
		'2026-09-17T10:40:00Z'
	),
	correction(
		'52714120-e8ac-4905-b923-bddb4c837ace',
		tobias,
		{
			action: 'change',
			target: {
				entryId: 'e71e65a6-e2ea-4d84-905b-9f050b2f9b82',
				startedAt: '2026-09-15T18:30:00Z',
				endedAt: '2026-09-15T21:00:00Z'
			},
			newStartedAt: '2026-09-15T18:30:00Z',
			newEndedAt: '2026-09-15T22:45:00Z',
			reason: 'Fristsache Jahresabschluss, bis 0:45 gearbeitet und zu früh ausgestempelt.'
		},
		'2026-09-16T06:05:00Z'
	)
];

const ledgerEntry = (
	id: string,
	bucketYear: number,
	entryType: VacationLedgerEntry['entryType'],
	days: string,
	effectiveDate: string,
	refs: Partial<Pick<VacationLedgerEntry, 'absenceId' | 'noticeId' | 'reason'>> = {}
): VacationLedgerEntry => ({
	id,
	bucketYear,
	entryType,
	days,
	effectiveDate,
	absenceId: refs.absenceId ?? null,
	noticeId: refs.noticeId ?? null,
	reason: refs.reason ?? null,
	createdAt: `${effectiveDate}T01:05:00Z`
});

const notice2025 = 'e5a7c1d2-3b4f-4e8a-9c6d-2f1b8a7e4d30';
const notice2026 = 'a3d9f2e1-7c4b-4a6e-8d5f-1e2c9b7a6f48';

const ledger2025: VacationLedgerEntry[] = [
	ledgerEntry('0b7e4c1a-5d2f-4a8e-9b3c-6f1d2e8a7c40', 2025, 'entitlement', '30.00', '2025-01-01'),
	ledgerEntry('1c8f5d2b-6e3a-4b9f-8c4d-7a2e3f9b8d51', 2025, 'taken', '-5.00', '2025-03-10', {
		absenceId: 'd4c2e8f1-9a7b-4c3d-8e6f-5b1a2c9d7e62'
	}),
	ledgerEntry('2d9a6e3c-7f4b-4c1a-9d5e-8b3f4a1c9e62', 2025, 'taken', '-15.00', '2025-07-28', {
		absenceId: 'e5d3f9a2-8b6c-4d4e-9f7a-6c2b3d1e8f73'
	}),
	ledgerEntry('3e1b7f4d-8a5c-4d2b-8e6f-9c4a5b2d1f73', 2025, 'taken', '-4.00', '2025-12-22', {
		absenceId: 'f6e4a1b3-9c7d-4e5f-8a8b-7d3c4e2f9a84'
	}),
	ledgerEntry('4f2c8a5e-9b6d-4e3c-9f7a-1d5b6c3e2a84', 2025, 'taken', '-2.00', '2026-01-05', {
		absenceId: 'ebec627f-3839-4ae4-9f7e-fd73b1be896e'
	}),
	ledgerEntry('5a3d9b6f-1c7e-4f4d-8a8b-2e6c7d4f3b95', 2025, 'expiry', '-4.00', '2026-03-31', {
		noticeId: notice2025
	})
];

const ledger2026: VacationLedgerEntry[] = [
	ledgerEntry('6b4e1c7a-2d8f-4a5e-9b9c-3f7d8e5a4c06', 2026, 'entitlement', '30.00', '2026-01-01'),
	ledgerEntry('7c5f2d8b-3e9a-4b6f-8c1d-4a8e9f6b5d17', 2026, 'taken', '-4.00', '2026-04-07', {
		absenceId: '68662c67-228a-4057-b450-5a9033ddc871'
	}),
	ledgerEntry('8d6a3e9c-4f1b-4c7a-9d2e-5b9f1a7c6e28', 2026, 'taken', '-10.00', '2026-06-22', {
		absenceId: '33ea092a-8440-40fd-9ce9-188da70808e2'
	}),
	ledgerEntry('9e7b4f1d-5a2c-4d8b-8e3f-6c1a2b8d7f39', 2026, 'refund_sick', '1.00', '2026-06-24', {
		absenceId: 'bd2d51f0-740c-4e54-a84b-8f66724b1015'
	}),
	ledgerEntry('af8c5a2e-6b3d-4e9c-9f4a-7d2b3c9e8a40', 2026, 'taken', '-3.00', '2026-12-21', {
		absenceId: '8dc8ceb2-5fd6-43e9-93f0-6b4de7d61805'
	})
];

const bucket2025 = (): VacationBucket => ({
	year: 2025,
	entitlement: '30.00',
	taken: '26.00',
	refunded: '0.00',
	adjusted: '0.00',
	expired: '4.00',
	remaining: '0.00',
	deadline: '2026-03-31',
	notice: {
		id: notice2025,
		sentAt: '2025-10-06T08:15:00Z',
		deadline: '2026-03-31',
		acknowledgedAt: '2025-10-07T06:40:00Z'
	},
	expiry: {
		decision: 'forfeit',
		explanation: { key: 'vacation.expiry.forfeited', params: { deadline: '2026-03-31' } }
	}
});

const bucket2026 = (): VacationBucket => ({
	year: 2026,
	entitlement: '30.00',
	taken: '17.00',
	refunded: '1.00',
	adjusted: '0.00',
	expired: '0.00',
	remaining: '14.00',
	deadline: '2027-03-31',
	notice: {
		id: notice2026,
		sentAt: '2026-09-15T07:00:00Z',
		deadline: '2027-03-31',
		acknowledgedAt: null
	},
	expiry: { decision: 'not_due', explanation: { key: 'vacation.expiry.not_due', params: {} } }
});

let absences = seedAbsences();
let corrections = seedCorrections();
let buckets = { 2025: bucket2025(), 2026: bucket2026() };

export const resetMockAbsences = () => {
	absences = seedAbsences();
	corrections = seedCorrections();
	buckets = { 2025: bucket2025(), 2026: bucket2026() };
};

const fail = (status: number, code: Exclude<ErrorCode, 'VALIDATION'>, message: string) =>
	HttpResponse.json({ code, message, details: null }, { status });

const invalid = (field: string, message: string, code = 'custom') =>
	HttpResponse.json(
		{ code: 'VALIDATION', message: 'Invalid input', details: [{ field, code, message }] },
		{ status: 400 }
	);

const overlaps = (a: Range, b: Range) => a.startDate <= b.endDate && b.startDate <= a.endDate;
const blocking: AbsenceStatus[] = ['pending', 'approved', 'cancel_pending'];

function account(year: number): VacationAccount {
	const pending = absences
		.filter((a) => a.employee.id === mara.id && a.type === 'vacation' && a.status === 'pending')
		.reduce((total, a) => total + Number(a.vacationDays), 0);
	const entitlement = {
		days: '30.00',
		explanations: [{ key: 'vacation.entitlement.full_year', params: { days: '30.00' } }]
	};
	if (year === 2026) {
		const shown = [buckets[2026], buckets[2025]];
		const remaining = shown.reduce((total, bucket) => total + Number(bucket.remaining), 0);
		return {
			employeeId: mara.id,
			year,
			entitlement,
			buckets: shown,
			pending: toDays(pending),
			available: toDays(remaining - pending),
			ledger: [...ledger2025, ...ledger2026].toSorted((a, b) =>
				a.effectiveDate.localeCompare(b.effectiveDate)
			)
		};
	}
	if (year === 2025) {
		return {
			employeeId: mara.id,
			year,
			entitlement,
			buckets: [buckets[2025]],
			pending: '0.00',
			available: '0.00',
			ledger: ledger2025
		};
	}
	return {
		employeeId: mara.id,
		year,
		entitlement,
		buckets: [],
		pending: '0.00',
		available: '0.00',
		ledger: []
	};
}

function decide<T extends { id: string; employee: { id: string } }>(
	list: T[],
	id: string,
	change: (entry: T) => T | Response
) {
	const index = list.findIndex((entry) => entry.id === id);
	const entry = list[index];
	if (!entry) return fail(404, 'NOT_FOUND', 'Request not found');
	const changed = change(entry);
	if (changed instanceof Response) return changed;
	list[index] = changed;
	return HttpResponse.json(changed);
}

const decision = (note?: string) => ({
	decidedBy: { id: '3f6c2a9e-8b1d-4c57-9e0a-5d2b7f4a1c38', displayName: mara.name },
	decidedAt: new Date().toISOString(),
	decisionNote: note ?? null
});

const own = (entry: { employee: { id: string } }) => entry.employee.id === mara.id;
const forbiddenOwn = () => fail(403, 'FORBIDDEN', 'Nobody decides on their own requests');
const wrongState = () => fail(409, 'INVALID_STATE', 'Request is no longer open');

async function readNote(request: Request) {
	const body = (await request.json()) as { note?: string };
	return body.note?.trim() || undefined;
}

export const absenceHandlers = [
	http.post('/api/absences/preview', async ({ request }) => {
		const parsed = createAbsenceSchema.safeParse(await request.json());
		if (!parsed.success) {
			const issue = parsed.error.issues[0]!;
			return invalid(issue.path.join('.'), issue.message, issue.code);
		}
		const input = parsed.data;
		const days = costOf(input);
		const vacationDays = sum(days, (day) => Number(day.vacationDays));
		const byYear = new Map<number, number>();
		for (const day of days) {
			const year = Number(day.date.slice(0, 4));
			byYear.set(year, (byYear.get(year) ?? 0) + Number(day.vacationDays));
		}
		const available = Number(account(2026).available);
		return HttpResponse.json({
			days,
			vacationDays: toDays(vacationDays),
			targetMinutes: sum(days, (day) => day.targetMinutes),
			allocations:
				input.type === 'vacation'
					? [...byYear]
							.filter(([, taken]) => taken > 0)
							.map(([bucketYear, taken]) => ({ bucketYear, days: toDays(taken) }))
					: [],
			remainingAfter: input.type === 'vacation' ? toDays(available - vacationDays) : null,
			overlapsWith: absences
				.filter((a) => own(a) && blocking.includes(a.status) && overlaps(a, input))
				.map((a) => a.id)
		} satisfies AbsencePreview);
	}),

	http.post('/api/absences', async ({ request }) => {
		const parsed = createAbsenceSchema.safeParse(await request.json());
		if (!parsed.success) {
			const issue = parsed.error.issues[0]!;
			return invalid(issue.path.join('.'), issue.message, issue.code);
		}
		const input = parsed.data;
		const clash = absences.some(
			(a) => own(a) && a.type !== 'sick' && blocking.includes(a.status) && overlaps(a, input)
		);
		if (input.type !== 'sick' && clash) {
			return fail(409, 'TIME_OVERLAP', 'Overlaps an existing request');
		}
		// sick leave is only reported, it never waits for a decision
		const created = absence(
			crypto.randomUUID(),
			mara,
			input.type,
			input.startDate,
			input.endDate,
			input.type === 'sick' ? 'approved' : 'pending',
			{
				halfDayStart: input.halfDayStart,
				halfDayEnd: input.halfDayEnd,
				note: input.note ?? null,
				decidedBy: null,
				decidedAt: null,
				createdAt: new Date().toISOString()
			}
		);
		absences.push(created);
		return HttpResponse.json(created, { status: 201 });
	}),

	http.get('/api/absences', ({ request }) => {
		const params = new URL(request.url).searchParams;
		const scope = params.get('scope') ?? 'mine';
		const from = params.get('from') ?? '0000-01-01';
		const to = params.get('to') ?? '9999-12-31';
		const statuses = params.getAll('status').flatMap((s) => s.split(','));
		const types = params.getAll('type').flatMap((s) => s.split(','));
		const items = absences
			.filter((a) => (scope === 'mine' ? own(a) : scope === 'inbox' ? !own(a) : true))
			.filter((a) => a.startDate <= to && a.endDate >= from)
			.filter((a) => statuses.length === 0 || statuses.includes(a.status))
			.filter((a) => types.length === 0 || types.includes(a.type))
			.toSorted((a, b) =>
				scope === 'mine'
					? b.startDate.localeCompare(a.startDate)
					: a.createdAt.localeCompare(b.createdAt)
			);
		return HttpResponse.json({ items, nextCursor: null });
	}),

	http.post('/api/absences/:id/approve', ({ params }) =>
		decide<Absence>(absences, String(params.id), (a) => {
			if (own(a)) return forbiddenOwn();
			if (a.status === 'pending') return { ...a, status: 'approved', ...decision() };
			if (a.status === 'cancel_pending') return { ...a, status: 'cancelled', ...decision() };
			return wrongState();
		})
	),

	http.post('/api/absences/:id/reject', async ({ params, request }) => {
		const note = await readNote(request);
		if (!note) return invalid('note', '', 'too_small');
		return decide<Absence>(absences, String(params.id), (a) => {
			if (own(a)) return forbiddenOwn();
			if (a.status === 'pending') return { ...a, status: 'rejected', ...decision(note) };
			// a declined cancellation leaves the leave as it was approved
			if (a.status === 'cancel_pending') return { ...a, status: 'approved', ...decision(note) };
			return wrongState();
		});
	}),

	http.post('/api/absences/:id/withdraw', ({ params }) =>
		decide<Absence>(absences, String(params.id), (a) => {
			if (!own(a)) return fail(403, 'FORBIDDEN', 'Only the requester withdraws');
			return a.status === 'pending' ? { ...a, status: 'withdrawn' } : wrongState();
		})
	),

	http.post('/api/absences/:id/cancel', async ({ params, request }) => {
		const note = await readNote(request);
		return decide<Absence>(absences, String(params.id), (a) => {
			if (!own(a)) return fail(403, 'FORBIDDEN', 'Only the requester cancels');
			if (a.status !== 'approved') return wrongState();
			return { ...a, status: 'cancel_pending', note: note ?? a.note };
		});
	}),

	http.post('/api/absences/:id/confirm-sick-note', ({ params }) =>
		decide<Absence>(absences, String(params.id), (a) => {
			if (own(a)) return forbiddenOwn();
			if (a.type !== 'sick' || a.sickNote) return wrongState();
			return {
				...a,
				sickNote: {
					confirmedAt: new Date().toISOString(),
					confirmedBy: { id: '3f6c2a9e-8b1d-4c57-9e0a-5d2b7f4a1c38', displayName: mara.name }
				}
			};
		})
	),

	// only the decision side, own corrections belong to the time pages and their mocks
	http.get('/api/corrections', ({ request }) => {
		const params = new URL(request.url).searchParams;
		const scope = params.get('scope') ?? 'mine';
		if (scope === 'mine') return undefined;
		const statuses = params.getAll('status').flatMap((s) => s.split(','));
		const items = corrections
			.filter((c) => (scope === 'inbox' ? !own(c) : true))
			.filter((c) => statuses.length === 0 || statuses.includes(c.status));
		return HttpResponse.json({ items, nextCursor: null });
	}),

	http.post('/api/corrections/:id/approve', ({ params }) =>
		decide<Correction>(corrections, String(params.id), (c) => {
			if (own(c)) return forbiddenOwn();
			return c.status === 'pending' ? { ...c, status: 'approved', ...decision() } : wrongState();
		})
	),

	http.post('/api/corrections/:id/reject', async ({ params, request }) => {
		const note = await readNote(request);
		if (!note) return invalid('note', '', 'too_small');
		return decide<Correction>(corrections, String(params.id), (c) => {
			if (own(c)) return forbiddenOwn();
			return c.status === 'pending'
				? { ...c, status: 'rejected', ...decision(note) }
				: wrongState();
		});
	}),

	http.get('/api/employees/:id/vacation', ({ params, request }) => {
		if (params.id !== mara.id) return fail(404, 'NOT_FOUND', 'Employee not found');
		const year = Number(new URL(request.url).searchParams.get('year'));
		return HttpResponse.json(account(year));
	}),

	http.post('/api/me/vacation/notices/:id/acknowledge', ({ params }) => {
		const bucket = Object.values(buckets).find((b) => b.notice?.id === params.id);
		if (!bucket?.notice) return fail(404, 'NOT_FOUND', 'Notice not found');
		if (bucket.notice.acknowledgedAt) return wrongState();
		bucket.notice = { ...bucket.notice, acknowledgedAt: new Date().toISOString() };
		return new HttpResponse(null, { status: 204 });
	}),

	http.get('/api/team-calendar', ({ request }) => {
		const params = new URL(request.url).searchParams;
		const month = params.get('month') ?? '';
		const team = params.get('team') ?? teamIds.tax;
		const first = `${month}-01`;
		const last = addDays(`${addDays(first, 31).slice(0, 7)}-01`, -1);
		const people = (members[team] ?? []).map((member) => ({
			employee: { id: member.id, name: member.name },
			days: absences
				.filter((a) => a.employee.id === member.id && blocking.includes(a.status))
				.flatMap((a) =>
					costOf(a)
						.filter((day) => day.portion > 0 && day.date >= first && day.date <= last)
						.map((day) => ({
							date: day.date,
							portion: day.portion as 0.5 | 1,
							type: a.type,
							status: a.status as 'pending' | 'approved' | 'cancel_pending'
						}))
				)
		}));
		return HttpResponse.json({
			month,
			holidays: holidays.filter((day) => day.date.startsWith(month)),
			people
		} satisfies TeamCalendar);
	})
];
