import {
	createContractSchema,
	createEmployeeSchema,
	createFlexBookingSchema,
	createTeamSchema,
	createVacationNoticesSchema,
	createWorkModelSchema,
	ackFindingSchema,
	reopenMonthSchema,
	teamLeadsSchema,
	updateEmployeeSchema,
	updateTeamSchema,
	updateWorkModelSchema,
	weekdays,
	type AuditEntry,
	type Contract,
	type Employee,
	type ErrorCode,
	type Finding,
	type FlexAccount,
	type FlexBooking,
	type Holiday,
	type MonthChecklist,
	type MonthClosing,
	type MonthOverview,
	type Role,
	type RuleSetInfo,
	type Team,
	type Timesheet,
	type VacationNotice,
	type WeekdayMinutes,
	type WorkModel
} from '@zeit/shared';
import { http, HttpResponse } from 'msw';
import type { ZodError } from 'zod';
import { absenceOn, teamIds } from './absences';
import { mockSession } from './session';

export { teamIds };

const seq = (n: number) => `00000000-0000-4000-8000-${n.toString(16).padStart(12, '0')}`;
let nextSeq = 1000;
const newId = () => seq(nextSeq++);

export const signedInAs = (role: Role) =>
	http.get('/api/auth/session', () =>
		HttpResponse.json({ ...mockSession, user: { ...mockSession.user, role } })
	);

const fail = (status: number, code: Exclude<ErrorCode, 'VALIDATION'>, message: string) =>
	HttpResponse.json({ code, message, details: null }, { status });

const invalid = (error: ZodError) =>
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

const done = () => new HttpResponse(null, { status: 204 });

const person = (
	id: string,
	userId: string | null,
	personnelNo: string,
	firstName: string,
	lastName: string,
	teamId: string | null,
	entryDate: string,
	exitDate: string | null = null
): Employee => ({
	id,
	personnelNo,
	firstName,
	lastName,
	teamId,
	userId,
	entryDate,
	exitDate,
	closedThrough: '2026-07-31'
});

const seedEmployees = (): Employee[] => [
	person(
		'2cfefd95-d735-4202-bf6e-eaaaaef60f62',
		'bb3deb4b-00e1-4c28-a4d6-de86c556bb22',
		'1001',
		'Katrin',
		'Hölscher',
		teamIds.tax,
		'2014-04-01'
	),
	person(
		'16755866-32a5-453d-9d32-8e69c26b1712',
		'0ad3ed76-7ec4-4d71-9999-0637e56804dc',
		'1002',
		'Frank',
		'Oberdiek',
		teamIds.payroll,
		'2015-10-01'
	),
	person(
		'0169be92-d1eb-4247-894c-43e0adb8926c',
		'5b004527-423c-4b82-89ae-323b702a9c62',
		'1003',
		'Sabine',
		'Kortmann',
		null,
		'2016-01-01'
	),
	person(
		'60f75051-d386-4bd1-912a-74a882f967e8',
		'7d6baf86-75ed-4897-9ed1-61587ad9e279',
		'1004',
		'Lea',
		'Schwerdtfeger',
		teamIds.tax,
		'2018-08-01'
	),
	person(
		'92dc29e8-4316-4122-bb5c-d3d0e2a12e94',
		'2ad6595f-149f-45ac-8b75-1baedd67e6d8',
		'1005',
		'Petra',
		'Wiegand',
		teamIds.books,
		'2019-05-01'
	),
	person(
		'e7d92163-8978-482b-b7ea-ef5ede80e554',
		'd4db9c3c-5804-4d41-9144-cf2610777c95',
		'1006',
		'Anja',
		'Feldkamp',
		teamIds.books,
		'2017-07-01',
		'2026-09-30'
	),
	person(
		'8d41b7c2-0e5f-4a93-b6d8-2c7e9f13a054',
		'3f6c2a9e-8b1d-4c57-9e0a-5d2b7f4a1c38',
		'1007',
		'Mara',
		'Lenz',
		teamIds.tax,
		'2021-02-01'
	),
	person(
		'c3b6acda-69ef-4700-8e94-95c62af4f156',
		null,
		'1008',
		'Bernd',
		'Voss',
		null,
		'2012-01-01',
		'2025-12-31'
	),
	person(
		'bc1e61b4-d3d8-4290-9124-bc7adf87efde',
		'9e54ff3b-ee67-48c7-8424-9364dabd4b90',
		'1009',
		'Deniz',
		'Aydın',
		teamIds.tax,
		'2022-09-01'
	),
	person(
		'67d6b390-2fd7-4f0f-8a3d-f855b253283f',
		'6d072ca6-2c26-47f3-b618-69da9b9a1ac3',
		'1010',
		'Helin',
		'Demir',
		teamIds.payroll,
		'2022-11-15'
	),
	person(
		'f4fa8137-2571-4add-ba96-add65c1f7104',
		'30593c7c-95be-42e3-a23b-060f9bab7fa0',
		'1011',
		'Jonas',
		'Brandt',
		teamIds.tax,
		'2023-01-01'
	),
	person(
		'09cbac3e-5b5a-474e-9654-f777b63fddad',
		'07365063-3384-4eeb-a446-a1eab9b8b24c',
		'1012',
		'Tobias',
		'Kämmerer',
		teamIds.tax,
		'2024-03-01'
	),
	person(
		'ca7c057f-df47-4b32-b1d2-5b39b3f52a2f',
		'28088189-c18e-4c60-a818-6676014a4248',
		'1013',
		'Nils',
		'Hagedorn',
		teamIds.books,
		'2026-03-15'
	)
];

export const mockEmployees = seedEmployees();
const byName = (lastName: string) => mockEmployees.find((e) => e.lastName === lastName)!;

const week = (mon: number, tue: number, wed: number, thu: number, fri: number): WeekdayMinutes => ({
	mon,
	tue,
	wed,
	thu,
	fri,
	sat: 0,
	sun: 0
});

export const workModelIds = {
	full39: 'c535aafb-2f1b-4879-83d6-855b0d05b791',
	full40: '61116ead-c2c8-4980-9cd2-39aec97f1c86',
	part30: '8d1a63ae-3e07-4950-b170-6b88875aa4b6',
	threeDays: '5993717b-dd3a-4683-8bf7-762ef2784abd',
	mornings: 'efd0d36c-1de2-4597-83d0-52d7602e50aa',
	old385: 'fbd065b1-844f-482f-bb6b-0c944f92d83b'
};

const seedWorkModels = (): WorkModel[] => [
	{
		id: workModelIds.full39,
		name: 'Vollzeit 39 h (Mo–Fr)',
		minutes: week(468, 468, 468, 468, 468),
		archivedAt: null
	},
	{
		id: workModelIds.full40,
		name: 'Vollzeit 40 h (Mo–Fr)',
		minutes: week(480, 480, 480, 480, 480),
		archivedAt: null
	},
	{
		id: workModelIds.part30,
		name: 'Teilzeit 30 h (Mo–Fr)',
		minutes: week(360, 360, 360, 360, 360),
		archivedAt: null
	},
	{
		id: workModelIds.threeDays,
		name: 'Teilzeit 3 Tage (Di–Do)',
		minutes: week(0, 468, 468, 468, 0),
		archivedAt: null
	},
	{
		id: workModelIds.mornings,
		name: 'Teilzeit 20 h (vormittags)',
		minutes: week(240, 240, 240, 240, 240),
		archivedAt: null
	},
	{
		id: workModelIds.old385,
		name: 'Vollzeit 38,5 h (bis 2023)',
		minutes: week(462, 462, 462, 462, 462),
		archivedAt: '2024-01-02T08:00:00+01:00'
	}
];

const contract = (
	employee: Employee,
	validFrom: string,
	modelId: string,
	changes: Partial<Contract> = {}
): Contract => ({
	id: newId(),
	employeeId: employee.id,
	validFrom,
	workModelId: modelId,
	minutes: seedWorkModels().find((model) => model.id === modelId)!.minutes,
	vacationDaysYear: '30.0',
	vacationBasisDays: 5,
	flexCapPlusMinutes: null,
	flexCapMinusMinutes: null,
	createdAt: `${validFrom}T09:00:00+02:00`,
	...changes
});

const seedContracts = (): Contract[] => {
	const special: Record<string, Contract[]> = {
		Schwerdtfeger: [
			contract(byName('Schwerdtfeger'), '2018-08-01', workModelIds.old385),
			contract(byName('Schwerdtfeger'), '2024-01-01', workModelIds.full39),
			contract(byName('Schwerdtfeger'), '2026-07-01', workModelIds.threeDays, {
				vacationDaysYear: '18.0',
				vacationBasisDays: 3
			})
		],
		Aydın: [
			contract(byName('Aydın'), '2022-09-01', workModelIds.full39),
			contract(byName('Aydın'), '2026-11-01', workModelIds.part30)
		],
		Demir: [contract(byName('Demir'), '2022-11-15', workModelIds.part30)],
		Oberdiek: [
			contract(byName('Oberdiek'), '2015-10-01', workModelIds.full39, {
				flexCapPlusMinutes: 3000,
				flexCapMinusMinutes: 600
			})
		],
		Hagedorn: [
			contract(byName('Hagedorn'), '2026-03-15', workModelIds.full40, { vacationDaysYear: '28.0' })
		]
	};
	return mockEmployees.flatMap(
		(employee) =>
			special[employee.lastName] ?? [contract(employee, employee.entryDate, workModelIds.full39)]
	);
};

const seedTeams = (): Omit<Team, 'memberCount'>[] => [
	{
		id: teamIds.tax,
		name: 'Steuerberatung',
		leads: [{ id: byName('Hölscher').userId!, displayName: 'Katrin Hölscher' }]
	},
	{
		id: teamIds.payroll,
		name: 'Lohnbuchhaltung',
		leads: [{ id: byName('Oberdiek').userId!, displayName: 'Frank Oberdiek' }]
	},
	{
		id: teamIds.books,
		name: 'Finanzbuchhaltung',
		leads: [{ id: byName('Wiegand').userId!, displayName: 'Petra Wiegand' }]
	}
];

const sabineRef = { id: byName('Kortmann').userId!, displayName: 'Sabine Kortmann' };
const ref = (employee: Employee) => ({
	id: employee.id,
	name: `${employee.firstName} ${employee.lastName}`
});

const seedNotices = (): VacationNotice[] =>
	['Lenz', 'Hölscher', 'Brandt', 'Demir', 'Wiegand'].map((lastName, i) => ({
		id: newId(),
		employee: ref(byName(lastName)),
		bucketYear: 2026,
		remainingDays: ['14.00', '9.50', '21.00', '6.00', '12.00'][i]!,
		deadline: '2027-03-31',
		sentAt: `2026-09-${String(15 + (i % 2)).padStart(2, '0')}T07:00:00+02:00`,
		sentBy: sabineRef,
		channel: i === 3 ? 'letter' : 'in_app',
		textVersion: 'notice-2026-1',
		acknowledgedAt: i === 1 || i === 4 ? `2026-09-${17 + i}T10:12:00+02:00` : null
	}));

const finding = (
	lastName: string,
	date: string,
	code: Finding['code'],
	facts: Finding['facts'] = {},
	ack: Finding['ack'] = null
): Finding => ({
	employee: ref(byName(lastName)),
	date,
	code,
	severity: code === 'ARBZG_3_OVER_8' ? 'info' : 'warning',
	ruleVersion: 'arbzg-1994',
	facts,
	explanation: { key: `arbzg.${code}`, params: {} },
	ack
});

const seedFindings = (): Finding[] => [
	finding('Hölscher', '2026-06-04', 'ARBZG_9_HOLIDAY'),
	finding(
		'Kämmerer',
		'2026-08-20',
		'ARBZG_4_CONTINUOUS_6H',
		{ continuousMinutes: 405 },
		{
			at: '2026-08-24T09:30:00+02:00',
			by: sabineRef,
			note: 'Abgabe Jahresabschluss Mandant Wendt, mit Tobias besprochen'
		}
	),
	finding('Oberdiek', '2026-09-06', 'ARBZG_9_SUNDAY'),
	finding('Brandt', '2026-09-08', 'ARBZG_3_OVER_10', { minutes: 640 }),
	finding('Aydın', '2026-09-22', 'ARBZG_4_BREAK_SHORT', { requiredMinutes: 45, actualMinutes: 30 }),
	finding('Demir', '2026-09-11', 'ARBZG_5_REST_UNDER_11H', { restMinutes: 555 }),
	finding('Lenz', '2026-09-15', 'ARBZG_3_OVER_8', { minutes: 530 })
];

export const ruleVersions: RuleSetInfo[] = [
	{
		version: 'arbzg-1994',
		validFrom: '1994-07-01',
		limits: {
			regularDailyMinutes: 480,
			maxDailyMinutes: 600,
			breakOver6hMinutes: 30,
			breakOver9hMinutes: 45,
			minBreakMinutes: 15,
			maxContinuousMinutes: 360,
			minRestMinutes: 660
		}
	}
];

export const holidaysNw: Holiday[] = [
	{ date: '2026-01-01', code: 'new_year', portion: 1 },
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

const katrin = byName('Hölscher');
const frank = byName('Oberdiek');

const seedBookings = (): FlexBooking[] => [
	...mockEmployees.map((employee, i): FlexBooking => ({
		id: newId(),
		employeeId: employee.id,
		type: 'opening',
		minutes: [2280, 1500, -360, 600, 840, 120, 1260, 0, 300, -240, 960, 480, 0][i] ?? 0,
		effectiveDate: '2026-01-01',
		reason: 'Übertrag des Saldos aus 2025',
		monthClosingId: null,
		createdBy: sabineRef,
		createdAt: '2026-01-02T08:15:00+01:00'
	})),
	{
		id: newId(),
		employeeId: katrin.id,
		type: 'cap_forfeit',
		minutes: -95,
		effectiveDate: '2026-07-31',
		reason: 'Kappung auf 40:00 h beim Abschluss Juli',
		monthClosingId: seq(90),
		createdBy: null,
		createdAt: '2026-08-05T11:00:00+02:00'
	},
	{
		id: newId(),
		employeeId: frank.id,
		type: 'payout',
		minutes: -480,
		effectiveDate: '2026-06-30',
		reason: 'Auszahlung von 8 Stunden mit der Juni-Abrechnung',
		monthClosingId: null,
		createdBy: sabineRef,
		createdAt: '2026-06-26T14:40:00+02:00'
	}
];

type ChecklistItem = MonthChecklist['items'][number];

const seedOpenPoints = (): Record<string, ChecklistItem[]> => ({
	'2026-08': [
		{
			kind: 'pending_correction',
			blocking: true,
			employees: [ref(byName('Brandt'))],
			explanation: { key: 'months.pending_correction', params: { count: 1 } }
		},
		{
			kind: 'open_finding',
			blocking: false,
			employees: [ref(byName('Brandt')), ref(byName('Aydın'))],
			explanation: { key: 'months.open_finding', params: { count: 2 } }
		}
	]
});

let employees = mockEmployees.map((employee) => ({ ...employee }));
let contracts = seedContracts();
let workModels = seedWorkModels();
let teams = seedTeams();
let notices = seedNotices();
let findings = seedFindings();
let bookings = seedBookings();
let openPoints = seedOpenPoints();
let closedMonth = '2026-07';

export const resetMockHr = () => {
	employees = mockEmployees.map((employee) => ({ ...employee }));
	contracts = seedContracts();
	workModels = seedWorkModels();
	teams = seedTeams();
	notices = seedNotices();
	findings = seedFindings();
	bookings = seedBookings();
	openPoints = seedOpenPoints();
	closedMonth = '2026-07';
};

const DAY_MS = 86_400_000;
const today = () => new Date().toISOString().slice(0, 10);
const addDays = (iso: string, days: number) =>
	new Date(Date.parse(iso) + days * DAY_MS).toISOString().slice(0, 10);

const shiftMonth = (month: string, by: number) => {
	const index = Number(month.slice(0, 4)) * 12 + Number(month.slice(5, 7)) - 1 + by;
	return `${Math.floor(index / 12)}-${String((index % 12) + 1).padStart(2, '0')}`;
};

const lastDayOf = (month: string) =>
	new Date(Date.UTC(Number(month.slice(0, 4)), Number(month.slice(5, 7)), 0))
		.toISOString()
		.slice(0, 10);

const nameOf = (employee: Employee) => `${employee.firstName} ${employee.lastName}`;
const findEmployee = (id: unknown) => employees.find((employee) => employee.id === id);

const contractOn = (employeeId: string, day: string) =>
	contracts
		.filter((c) => c.employeeId === employeeId && c.validFrom <= day)
		.sort((a, b) => b.validFrom.localeCompare(a.validFrom))[0];

const offsetOf = (day: string) => {
	const month = Number(day.slice(5, 7));
	return month >= 4 && month <= 10 ? '+02:00' : '+01:00';
};

const clock = (minute: number) =>
	`${String(Math.floor(minute / 60)).padStart(2, '0')}:${String(minute % 60).padStart(2, '0')}`;

function timesheetOf(employee: Employee, month: string): Timesheet {
	const days: Timesheet['days'] = [];
	const last = lastDayOf(month);
	const index = mockEmployees.findIndex((candidate) => candidate.id === employee.id);
	const start = 7 * 60 + 15 + ((index * 17) % 75);
	for (let day = `${month}-01`; day <= last; day = addDays(day, 1)) {
		const weekday = weekdays[(new Date(`${day}T00:00:00Z`).getUTCDay() + 6) % 7]!;
		const employed = day >= employee.entryDate && (!employee.exitDate || day <= employee.exitDate);
		const holiday = holidaysNw.find((candidate) => candidate.date === day) ?? null;
		const planned = employed ? (contractOn(employee.id, day)?.minutes[weekday] ?? 0) : 0;
		const target = holiday ? planned * (1 - holiday.portion) : planned;
		const away = target > 0 ? absenceOn(employee.id, day) : null;
		const due = away ? target * (1 - away.portion) : target;
		const past = day <= today();
		const worked = due > 0 && past;
		const extra = worked ? ((((Number(day.slice(8)) + index * 3) * 7) % 5) - 1 - (index % 3)) * 12 : 0;
		const minutes = due + extra;
		const offset = offsetOf(day);
		const at = (minute: number) => `${day}T${clock(minute)}:00${offset}`;
		let entries: Timesheet['days'][number]['entries'] = [];
		if (worked && minutes <= 360) entries = [{ startedAt: at(start), endedAt: at(start + minutes) }];
		else if (worked) {
			entries = [
				{ startedAt: at(start), endedAt: at(start + 240) },
				{ startedAt: at(start + 270), endedAt: at(start + 30 + minutes) }
			];
		}
		const workedMinutes = worked ? minutes : 0;
		const creditedMinutes = away && past ? target - due : 0;
		days.push({
			date: day,
			entries,
			breakMinutes: entries.length > 1 ? 30 : 0,
			targetMinutes: target,
			workedMinutes,
			creditedMinutes,
			diffMinutes: workedMinutes + creditedMinutes - (past ? target : 0),
			absence: away && { type: away.type, portion: away.portion },
			holiday: holiday?.code ?? null
		});
	}
	const sum = (pick: (day: Timesheet['days'][number]) => number) =>
		days.reduce((total, day) => total + pick(day), 0);
	return {
		tenant: { name: mockSession.tenant.name, state: 'NW' },
		employee: { id: employee.id, name: nameOf(employee), personnelNo: employee.personnelNo },
		month,
		closed: month <= closedMonth,
		days,
		totals: {
			targetMinutes: sum((day) => day.targetMinutes),
			workedMinutes: sum((day) => day.workedMinutes),
			creditedMinutes: sum((day) => day.creditedMinutes),
			diffMinutes: sum((day) => day.diffMinutes)
		},
		flexBalanceMinutes: accountOf(employee, Number(month.slice(0, 4))).balanceMinutes,
		generatedAt: new Date().toISOString()
	};
}

function accountOf(employee: Employee, year: number): FlexAccount {
	const own = bookings.filter(
		(booking) => booking.employeeId === employee.id && booking.effectiveDate.startsWith(`${year}`)
	);
	const openingMinutes = own
		.filter((booking) => booking.type === 'opening')
		.reduce((total, booking) => total + booking.minutes, 0);
	const lastMonth = year === Number(today().slice(0, 4)) ? Number(today().slice(5, 7)) : 12;
	const index = mockEmployees.findIndex((candidate) => candidate.id === employee.id);
	let balance = openingMinutes;
	const months: FlexAccount['months'] = [];
	for (let m = 1; m <= lastMonth; m++) {
		const month = `${year}-${String(m).padStart(2, '0')}`;
		const targetMinutes = 21 * 468;
		const diffMinutes = ((index * 37 + m * 53) % 400) - 150;
		const bookedMinutes = own
			.filter((booking) => booking.type !== 'opening' && booking.effectiveDate.startsWith(month))
			.reduce((total, booking) => total + booking.minutes, 0);
		balance += diffMinutes + bookedMinutes;
		months.push({
			month,
			targetMinutes,
			workedMinutes: targetMinutes + diffMinutes - 468,
			creditedMinutes: 468,
			bookedMinutes,
			diffMinutes,
			balanceMinutes: balance,
			closed: month <= closedMonth
		});
	}
	const current = contractOn(employee.id, today());
	return {
		employeeId: employee.id,
		year,
		openingMinutes,
		openingExplanation: { key: 'flex.opening.none', params: {} },
		balanceMinutes: balance,
		asOf: year === Number(today().slice(0, 4)) ? today() : `${year}-12-31`,
		cap: {
			plusMinutes: current?.flexCapPlusMinutes ?? 2400,
			minusMinutes: current?.flexCapMinusMinutes ?? 600,
			mode: 'forfeit_at_close'
		},
		months,
		bookings: own
	};
}

function capPreviewOf(month: string): MonthChecklist['capPreview'] {
	return employees
		.filter((e) => e.entryDate <= lastDayOf(month) && (!e.exitDate || e.exitDate >= `${month}-01`))
		.flatMap((employee) => {
			const account = accountOf(employee, Number(month.slice(0, 4)));
			const balance = account.months.find((row) => row.month === month)?.balanceMinutes ?? 0;
			const plusMinutes = account.cap.plusMinutes ?? 2400;
			const minusMinutes = account.cap.minusMinutes ?? 600;
			let forfeitedMinutes = 0;
			if (balance > plusMinutes) forfeitedMinutes = balance - plusMinutes;
			else if (balance < -minusMinutes) forfeitedMinutes = balance + minusMinutes;
			return forfeitedMinutes === 0 ? [] : [{ employee: ref(employee), forfeitedMinutes }];
		});
}

function checklistOf(month: string): MonthChecklist {
	if (month <= closedMonth) {
		return { month, closed: true, closable: false, items: [], capPreview: [] };
	}
	const next = shiftMonth(closedMonth, 1);
	if (month > next) {
		return {
			month,
			closed: false,
			closable: false,
			capPreview: [],
			items: [
				{
					kind: 'previous_month_open',
					blocking: true,
					employees: [],
					explanation: { key: 'months.previous_month_open', params: { month: next } }
				}
			]
		};
	}
	const items = openPoints[month] ?? [];
	const over = lastDayOf(month) < today();
	return {
		month,
		closed: false,
		closable: over && !items.some((item) => item.blocking),
		items,
		capPreview: capPreviewOf(month)
	};
}

const auditTables = [
	'time_entries',
	'absence_requests',
	'contracts',
	'employees',
	'flex_bookings',
	'correction_requests',
	'users',
	'month_closings'
] as const;

function seedAudit(): AuditEntry[] {
	const actors = [
		{ id: mockSession.user.id, name: 'Mara Lenz', role: 'admin' as const },
		{ id: sabineRef.id, name: sabineRef.displayName, role: 'hr' as const },
		{ id: katrin.userId!, name: 'Katrin Hölscher', role: 'team_lead' as const }
	];
	const staff = mockEmployees.filter((employee) => employee.exitDate === null);
	const start = Date.parse('2026-09-23T16:40:00+02:00');
	const actorFor = (table: (typeof auditTables)[number], subject: Employee, actor: (typeof actors)[number]) => {
		if (table === 'users') return actors[0]!;
		if (table === 'month_closings') return actors[1]!;
		if (actor.role !== 'team_lead') return actor;
		const own = subject.teamId === katrin.teamId;
		return own && (table === 'time_entries' || table === 'absence_requests') ? actor : actors[1]!;
	};
	return Array.from({ length: 130 }, (_, i): AuditEntry => {
		const occurredAt = new Date(start - i * 7 * 3_600_000 - (i % 5) * 600_000).toISOString();
		const subject = staff[i % staff.length]!;
		const actor = actors[i % actors.length]!;
		if (i % 11 === 4) {
			return {
				id: String(10_000 - i),
				occurredAt,
				actorUserId: actor.id,
				actorName: actor.name,
				actorRole: actor.role,
				source: 'app',
				action: 'login.succeeded',
				table: null,
				rowId: null,
				subjectEmployeeId: null,
				changes: null,
				context: { method: 'password' },
				requestId: null,
				ip: '203.0.113.24'
			};
		}
		const table = auditTables[i % auditTables.length]!;
		const by = actorFor(table, subject, actor);
		const day = occurredAt.slice(0, 10);
		const diffs: Record<(typeof auditTables)[number], NonNullable<AuditEntry['changes']>> = {
			time_entries: {
				ended_at: [null, `${day}T16:5${i % 10}:00+02:00`],
				end_reason: [null, 'leave']
			},
			absence_requests: {
				status: ['pending', 'approved'],
				decided_by: [null, by.id]
			},
			contracts: {
				valid_from: [null, '2026-07-01'],
				work_model_id: [null, workModelIds.threeDays],
				vacation_days_year: [null, '18.0']
			},
			employees: { team_id: [null, teamIds.tax] },
			flex_bookings: {
				type: [null, 'manual'],
				minutes: [null, 120],
				reason: [null, 'Mehrarbeit Jahresabschluss Mandant Wendt']
			},
			correction_requests: {
				action: [null, 'change'],
				reason: [null, 'Gehen vergessen, war bis 17:10 im Büro']
			},
			users: { role: ['employee', 'team_lead'] },
			month_closings: { month: [null, '2026-07-01'], action: [null, 'close'] }
		};
		return {
			id: String(10_000 - i),
			occurredAt,
			actorUserId: by.id,
			actorName: by.name,
			actorRole: by.role,
			source: 'trigger',
			action: table === 'time_entries' || table === 'absence_requests' ? 'update' : 'insert',
			table,
			rowId: seq(5000 + i),
			subjectEmployeeId: table === 'month_closings' || table === 'users' ? null : subject.id,
			changes: diffs[table],
			context: null,
			requestId: null,
			ip: null
		};
	});
}

const audit = seedAudit();

const withMemberCount = (team: Omit<Team, 'memberCount'>): Team => ({
	...team,
	memberCount: employees.filter((e) => e.teamId === team.id && !e.exitDate).length
});

const csv = (rows: (string | number)[][]) =>
	new HttpResponse(`\uFEFF${rows.map((row) => row.join(';')).join('\r\n')}\r\n`, {
		headers: {
			'Content-Type': 'text/csv; charset=utf-8',
			'Content-Disposition': 'attachment; filename="export.csv"'
		}
	});

export const hrHandlers = [
	http.get('/api/employees', ({ request }) => {
		const includeExited = new URL(request.url).searchParams.get('includeExited') === 'true';
		return HttpResponse.json(
			employees.filter((e) => includeExited || e.exitDate === null || e.exitDate >= today())
		);
	}),

	http.post('/api/employees', async ({ request }) => {
		const parsed = createEmployeeSchema.safeParse(await request.json());
		if (!parsed.success) return invalid(parsed.error);
		const { contract: first, ...input } = parsed.data;
		if (employees.some((e) => e.personnelNo === input.personnelNo)) {
			return fail(409, 'ALREADY_EXISTS', 'Personnel number taken');
		}
		const model = workModels.find((candidate) => candidate.id === first.workModelId);
		if (!model) return fail(404, 'NOT_FOUND', 'Work model not found');
		const created: Employee = {
			...input,
			id: newId(),
			userId: null,
			exitDate: null,
			closedThrough: lastDayOf(closedMonth)
		};
		employees.push(created);
		contracts.push({
			...first,
			id: newId(),
			employeeId: created.id,
			validFrom: created.entryDate,
			minutes: model.minutes,
			createdAt: new Date().toISOString()
		});
		return HttpResponse.json(created, { status: 201 });
	}),

	http.get('/api/employees/:id', ({ params }) => {
		const employee = findEmployee(params.id);
		return employee ? HttpResponse.json(employee) : fail(404, 'NOT_FOUND', 'Employee not found');
	}),

	http.patch('/api/employees/:id', async ({ params, request }) => {
		const employee = findEmployee(params.id);
		if (!employee) return fail(404, 'NOT_FOUND', 'Employee not found');
		const parsed = updateEmployeeSchema.safeParse(await request.json());
		if (!parsed.success) return invalid(parsed.error);
		Object.assign(employee, parsed.data);
		return HttpResponse.json(employee);
	}),

	http.post('/api/employees/:id/exit', async ({ params, request }) => {
		const employee = findEmployee(params.id);
		if (!employee) return fail(404, 'NOT_FOUND', 'Employee not found');
		const { exitDate } = (await request.json()) as { exitDate: string };
		if (exitDate <= lastDayOf(closedMonth)) return fail(409, 'PERIOD_LOCKED', 'Month is closed');
		employee.exitDate = exitDate;
		return HttpResponse.json(employee);
	}),

	http.get('/api/employees/:id/contracts', ({ params }) =>
		HttpResponse.json(contracts.filter((c) => c.employeeId === params.id))
	),

	http.post('/api/employees/:id/contracts', async ({ params, request }) => {
		const employee = findEmployee(params.id);
		if (!employee) return fail(404, 'NOT_FOUND', 'Employee not found');
		const parsed = createContractSchema.safeParse(await request.json());
		if (!parsed.success) return invalid(parsed.error);
		const input = parsed.data;
		if (input.validFrom <= lastDayOf(closedMonth)) {
			return fail(409, 'PERIOD_LOCKED', 'Month is closed');
		}
		if (contracts.some((c) => c.employeeId === employee.id && c.validFrom === input.validFrom)) {
			return fail(409, 'ALREADY_EXISTS', 'A contract starts on that day');
		}
		const model = workModels.find((candidate) => candidate.id === input.workModelId);
		if (!model) return fail(404, 'NOT_FOUND', 'Work model not found');
		const created: Contract = {
			...input,
			id: newId(),
			employeeId: employee.id,
			minutes: model.minutes,
			createdAt: new Date().toISOString()
		};
		contracts.push(created);
		return HttpResponse.json(created, { status: 201 });
	}),

	http.delete('/api/employees/:id/contracts/:cid', ({ params }) => {
		const target = contracts.find((c) => c.id === params.cid && c.employeeId === params.id);
		if (!target) return fail(404, 'NOT_FOUND', 'Contract not found');
		if (target.validFrom <= today()) return fail(409, 'INVALID_STATE', 'Contract has started');
		contracts = contracts.filter((c) => c !== target);
		return done();
	}),

	http.get('/api/work-models', ({ request }) => {
		const includeArchived = new URL(request.url).searchParams.get('includeArchived') === 'true';
		return HttpResponse.json(workModels.filter((m) => includeArchived || m.archivedAt === null));
	}),

	http.post('/api/work-models', async ({ request }) => {
		const parsed = createWorkModelSchema.safeParse(await request.json());
		if (!parsed.success) return invalid(parsed.error);
		const created: WorkModel = { ...parsed.data, id: newId(), archivedAt: null };
		workModels.push(created);
		return HttpResponse.json(created, { status: 201 });
	}),

	http.patch('/api/work-models/:id', async ({ params, request }) => {
		const model = workModels.find((candidate) => candidate.id === params.id);
		if (!model) return fail(404, 'NOT_FOUND', 'Work model not found');
		const parsed = updateWorkModelSchema.safeParse(await request.json());
		if (!parsed.success) return invalid(parsed.error);
		const { archived, ...changes } = parsed.data;
		Object.assign(model, changes);
		if (archived !== undefined) model.archivedAt = archived ? new Date().toISOString() : null;
		return HttpResponse.json(model);
	}),

	http.get('/api/teams', () => HttpResponse.json(teams.map(withMemberCount))),

	http.post('/api/teams', async ({ request }) => {
		const parsed = createTeamSchema.safeParse(await request.json());
		if (!parsed.success) return invalid(parsed.error);
		if (teams.some((team) => team.name === parsed.data.name)) {
			return fail(409, 'ALREADY_EXISTS', 'Team name taken');
		}
		const created = { id: newId(), name: parsed.data.name, leads: [] };
		teams.push(created);
		return HttpResponse.json(withMemberCount(created), { status: 201 });
	}),

	http.patch('/api/teams/:id', async ({ params, request }) => {
		const team = teams.find((candidate) => candidate.id === params.id);
		if (!team) return fail(404, 'NOT_FOUND', 'Team not found');
		const parsed = updateTeamSchema.safeParse(await request.json());
		if (!parsed.success) return invalid(parsed.error);
		Object.assign(team, parsed.data);
		return HttpResponse.json(withMemberCount(team));
	}),

	http.put('/api/teams/:id/leads', async ({ params, request }) => {
		const team = teams.find((candidate) => candidate.id === params.id);
		if (!team) return fail(404, 'NOT_FOUND', 'Team not found');
		const parsed = teamLeadsSchema.safeParse(await request.json());
		if (!parsed.success) return invalid(parsed.error);
		const known = new Map(team.leads.map((lead) => [lead.id, lead.displayName]));
		for (const e of employees) if (e.userId) known.set(e.userId, nameOf(e));
		if (parsed.data.userIds.some((id) => !known.has(id))) {
			return fail(404, 'NOT_FOUND', 'Unknown user');
		}
		team.leads = parsed.data.userIds.map((id) => ({ id, displayName: known.get(id)! }));
		return HttpResponse.json(withMemberCount(team));
	}),

	http.get('/api/vacation/notices', ({ request }) => {
		const search = new URL(request.url).searchParams;
		const year = Number(search.get('year'));
		const limit = Number(search.get('limit') ?? 50);
		const offset = Number(search.get('cursor') ?? 0);
		const matching = notices.filter((notice) => notice.bucketYear === year);
		return HttpResponse.json({
			items: matching.slice(offset, offset + limit),
			nextCursor: offset + limit < matching.length ? String(offset + limit) : null
		});
	}),

	http.post('/api/vacation/notices', async ({ request }) => {
		const parsed = createVacationNoticesSchema.safeParse(await request.json());
		if (!parsed.success) return invalid(parsed.error);
		const { bucketYear, employeeIds, channel } = parsed.data;
		const recipients = employeeIds.map(findEmployee);
		if (recipients.includes(undefined)) return fail(404, 'NOT_FOUND', 'Employee not found');
		const sent = (recipients as Employee[]).map((employee, i): VacationNotice => {
			return {
				id: newId(),
				employee: ref(employee),
				bucketYear,
				remainingDays: `${(4 + ((i * 5) % 17)).toFixed(0)}.00`,
				deadline: `${bucketYear + 1}-03-31`,
				sentAt: new Date().toISOString(),
				sentBy: { id: mockSession.user.id, displayName: mockSession.user.displayName },
				channel,
				textVersion: `notice-${bucketYear}-1`,
				acknowledgedAt: null
			};
		});
		notices.push(...sent);
		return HttpResponse.json(sent, { status: 201 });
	}),

	http.get('/api/employees/:id/flex', ({ params, request }) => {
		const employee = findEmployee(params.id);
		if (!employee) return fail(404, 'NOT_FOUND', 'Employee not found');
		const year = Number(new URL(request.url).searchParams.get('year'));
		return HttpResponse.json(accountOf(employee, year));
	}),

	http.post('/api/employees/:id/flex/bookings', async ({ params, request }) => {
		const employee = findEmployee(params.id);
		if (!employee) return fail(404, 'NOT_FOUND', 'Employee not found');
		const parsed = createFlexBookingSchema.safeParse(await request.json());
		if (!parsed.success) return invalid(parsed.error);
		if (parsed.data.effectiveDate <= lastDayOf(closedMonth)) {
			return fail(409, 'PERIOD_LOCKED', 'Month is closed');
		}
		const created: FlexBooking = {
			...parsed.data,
			id: newId(),
			employeeId: employee.id,
			monthClosingId: null,
			createdBy: { id: mockSession.user.id, displayName: mockSession.user.displayName },
			createdAt: new Date().toISOString()
		};
		bookings.push(created);
		return HttpResponse.json(created, { status: 201 });
	}),

	http.get('/api/compliance/findings', ({ request }) => {
		const search = new URL(request.url).searchParams;
		const from = search.get('from') ?? '0000-01-01';
		const to = search.get('to') ?? '9999-12-31';
		const employee = search.get('employee');
		const state = search.get('state');
		return HttpResponse.json(
			findings.filter(
				(f) =>
					f.date >= from &&
					f.date <= to &&
					(!employee || f.employee.id === employee) &&
					(!state || (state === 'open' ? f.ack === null : f.ack !== null))
			)
		);
	}),

	http.post('/api/compliance/findings/ack', async ({ request }) => {
		const parsed = ackFindingSchema.safeParse(await request.json());
		if (!parsed.success) return invalid(parsed.error);
		const input = parsed.data;
		const target = findings.find(
			(f) => f.employee.id === input.employeeId && f.date === input.date && f.code === input.code
		);
		if (!target) return fail(404, 'NOT_FOUND', 'Finding not found');
		if (target.ack) return fail(409, 'ALREADY_EXISTS', 'Already acknowledged');
		target.ack = {
			at: new Date().toISOString(),
			by: { id: mockSession.user.id, displayName: mockSession.user.displayName },
			note: input.note
		};
		return done();
	}),

	http.get('/api/compliance/rule-versions', () => HttpResponse.json(ruleVersions)),

	http.get('/api/months/:month/checklist', ({ params }) =>
		HttpResponse.json(checklistOf(String(params.month)))
	),

	http.post('/api/months/:month/close', ({ params }) => {
		const month = String(params.month);
		const checklist = checklistOf(month);
		if (!checklist.closable) return fail(409, 'INVALID_STATE', 'Month cannot be closed');
		const id = newId();
		const at = new Date().toISOString();
		for (const { employee, forfeitedMinutes } of checklist.capPreview) {
			bookings.push({
				id: newId(),
				employeeId: employee.id,
				type: 'cap_forfeit',
				minutes: -forfeitedMinutes,
				effectiveDate: lastDayOf(month),
				reason: `Kappung beim Abschluss ${month}`,
				monthClosingId: id,
				createdBy: null,
				createdAt: at
			});
		}
		closedMonth = month;
		for (const employee of employees) employee.closedThrough = lastDayOf(month);
		return HttpResponse.json({
			id,
			month,
			action: 'close',
			reason: null,
			actor: { id: mockSession.user.id, displayName: mockSession.user.displayName },
			at,
			capped: checklist.capPreview
		} satisfies MonthClosing);
	}),

	http.post('/api/months/:month/reopen', async ({ params, request }) => {
		const parsed = reopenMonthSchema.safeParse(await request.json());
		if (!parsed.success) return invalid(parsed.error);
		if (params.month !== closedMonth) {
			return fail(409, 'INVALID_STATE', 'Only the last closed month can be reopened');
		}
		const id = newId();
		const capped = bookings.filter(
			(booking) => booking.type === 'cap_forfeit' && booking.effectiveDate === lastDayOf(closedMonth)
		);
		for (const booking of capped) {
			bookings.push({
				...booking,
				id: newId(),
				minutes: -booking.minutes,
				reason: `Kappung zurückgebucht, ${closedMonth} wieder geöffnet`,
				monthClosingId: id,
				createdAt: new Date().toISOString()
			});
		}
		closedMonth = shiftMonth(closedMonth, -1);
		for (const employee of employees) employee.closedThrough = lastDayOf(closedMonth);
		return done();
	}),

	http.get('/api/exports/timesheet', ({ request }) => {
		const search = new URL(request.url).searchParams;
		const employee = findEmployee(search.get('employee'));
		if (!employee) return fail(404, 'NOT_FOUND', 'Employee not found');
		const sheet = timesheetOf(employee, search.get('month') ?? '');
		if (search.get('format') === 'json') return HttpResponse.json(sheet);
		return csv([
			['Datum', 'Pause', 'Ist', 'Soll', 'Differenz'],
			...sheet.days.map((day) => [
				day.date,
				day.breakMinutes,
				day.workedMinutes,
				day.targetMinutes,
				day.diffMinutes
			])
		]);
	}),

	http.get('/api/exports/month-overview', ({ request }) => {
		const search = new URL(request.url).searchParams;
		const month = search.get('month') ?? '';
		const staff = employees.filter(
			(e) => e.entryDate <= lastDayOf(month) && (!e.exitDate || e.exitDate >= `${month}-01`)
		);
		const overview: MonthOverview = {
			month,
			closed: month <= closedMonth,
			rows: staff.map((employee) => {
				const sheet = timesheetOf(employee, month);
				const away = (type: 'vacation' | 'sick') =>
					sheet.days
						.reduce((total, day) => total + (day.absence?.type === type ? day.absence.portion : 0), 0)
						.toFixed(2);
				return {
					employee: sheet.employee,
					...sheet.totals,
					flexBalanceMinutes: sheet.flexBalanceMinutes,
					vacationDays: away('vacation'),
					sickDays: away('sick'),
					openFindings: findings.filter(
						(f) => f.employee.id === employee.id && f.date.startsWith(month) && !f.ack
					).length
				};
			}),
			generatedAt: new Date().toISOString()
		};
		if (search.get('format') === 'json') return HttpResponse.json(overview);
		return csv([
			['Personalnummer', 'Name', 'Soll', 'Ist', 'Differenz', 'Saldo'],
			...overview.rows.map((row) => [
				row.employee.personnelNo,
				row.employee.name,
				row.targetMinutes,
				row.workedMinutes,
				row.diffMinutes,
				row.flexBalanceMinutes
			])
		]);
	}),

	http.get('/api/audit', ({ request }) => {
		const search = new URL(request.url).searchParams;
		const from = search.get('from') ?? '0000-01-01';
		const to = search.get('to') ?? '9999-12-31';
		const table = search.get('table');
		const employee = search.get('employee');
		const row = search.get('row');
		const limit = Number(search.get('limit') ?? 50);
		const offset = Number(search.get('cursor') ?? 0);
		const matching = audit.filter((entry) => {
			const day = entry.occurredAt.slice(0, 10);
			return (
				day >= from &&
				day <= to &&
				(!table || entry.table === table) &&
				(!employee || entry.subjectEmployeeId === employee) &&
				(!row || entry.rowId === row)
			);
		});
		const items = matching.slice(offset, offset + limit);
		return HttpResponse.json({
			items,
			nextCursor: offset + limit < matching.length ? String(offset + limit) : null
		});
	})
];
