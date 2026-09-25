import { parseDecimal, type Employment } from '@zeit/rules';
import type { Role, WeekdayMinutes } from '@zeit/shared';
import { Temporal } from 'temporal-polyfill';
import { endOfMonth, type Calendar } from './calendar';
import type { PlanRow } from './index';
import type { Random } from './random';

const FIRST_NAMES = [
	'Anna',
	'Jonas',
	'Miriam',
	'Tobias',
	'Katharina',
	'Felix',
	'Sabine',
	'Lukas',
	'Julia',
	'Markus',
	'Laura',
	'Stefan',
	'Nina',
	'Daniel',
	'Petra',
	'Jan',
	'Carina',
	'Thomas',
	'Svenja',
	'Michael',
	'Elena',
	'Florian',
	'Birgit',
	'Kai'
];

const LAST_NAMES = [
	'Becker',
	'Hoffmann',
	'Schulte',
	'Wagner',
	'Krämer',
	'Brandt',
	'Vogel',
	'Lorenz',
	'Hartmann',
	'Kessler',
	'Winter',
	'Albers',
	'Busch',
	'Engel',
	'Franke',
	'Haas',
	'Jansen',
	'Kuhn',
	'Lange',
	'Möller',
	'Otto',
	'Peters',
	'Roth',
	'Seidel'
];

const TEAMS = ['Finanzbuchhaltung', 'Lohn und Gehalt', 'Jahresabschluss'];

const MODELS = {
	full: {
		name: 'Vollzeit 38,5 h',
		minutes: { mon: 462, tue: 462, wed: 462, thu: 462, fri: 462, sat: 0, sun: 0 }
	},
	part: {
		name: 'Teilzeit 30 h',
		minutes: { mon: 360, tue: 360, wed: 360, thu: 360, fri: 360, sat: 0, sun: 0 }
	},
	threeDays: {
		name: 'Teilzeit 3 Tage',
		minutes: { mon: 462, tue: 462, wed: 462, thu: 0, fri: 0, sat: 0, sun: 0 }
	}
} satisfies Record<string, { name: string; minutes: WeekdayMinutes }>;

type Seat = {
	key: string;
	team: number;
	role: Role;
	model: keyof typeof MODELS;
	drift: number;
	balance: number | null;
	carryover: string | null;
};

// who plays which scene is fixed, the seed only picks names, entry dates and clock times
// prettier-ignore
const ROSTER = [
	{ key: 'lead', team: 0, role: 'team_lead', model: 'full', drift: 3, balance: 750, carryover: '2.00' },
	{ key: 'worker', team: 0, role: 'employee', model: 'full', drift: 1, balance: 255, carryover: '4.50' },
	{ key: 'busy', team: 0, role: 'employee', model: 'full', drift: 5, balance: 1260, carryover: null },
	{ key: 'partTimer', team: 0, role: 'employee', model: 'part', drift: 2, balance: 570, carryover: null },
	{ key: 'forgetful', team: 0, role: 'employee', model: 'full', drift: -3, balance: -360, carryover: null },
	{ key: 'payrollLead', team: 1, role: 'team_lead', model: 'full', drift: 4, balance: 960, carryover: '3.00' },
	{ key: 'hr', team: 1, role: 'hr', model: 'full', drift: 0, balance: 160, carryover: null },
	{ key: 'switcher', team: 1, role: 'employee', model: 'full', drift: -2, balance: -110, carryover: null },
	// the balance of the capped lead follows from the cap, see settle()
	{ key: 'capped', team: 2, role: 'team_lead', model: 'full', drift: 0, balance: null, carryover: null },
	{ key: 'newcomer', team: 2, role: 'employee', model: 'full', drift: 3, balance: null, carryover: null },
	{ key: 'leaver', team: 2, role: 'employee', model: 'full', drift: -1, balance: 70, carryover: null },
	{ key: 'noticed', team: 2, role: 'employee', model: 'full', drift: 6, balance: 1650, carryover: '6.00' }
] as const satisfies readonly Seat[];

export type Key = (typeof ROSTER)[number]['key'];

export type Person = {
	key: Key;
	team: number;
	employee: PlanRow<'employees'>;
	user: PlanRow<'users'>;
	employment: Employment;
	// minutes above target on an ordinary day
	drift: number;
	// balance wanted for the evening before today
	balance: number | null;
	// rest of last year's leave taken over from the old system
	carryover: string | null;
	arrival: number;
};

export type Cast = Record<Key, Person> & {
	people: Person[];
	admin: PlanRow<'users'>;
	teams: PlanRow<'teams'>[];
	workModels: PlanRow<'workModels'>[];
	contracts: PlanRow<'contracts'>[];
};

const mailbox = (name: string) =>
	name
		.toLowerCase()
		.replace(/ä/g, 'ae')
		.replace(/ö/g, 'oe')
		.replace(/ü/g, 'ue')
		.replace(/ß/g, 'ss');

export function hire(rng: Random, calendar: Calendar, tag: string): Cast {
	const { year } = calendar;
	const firstNames = rng.shuffle(FIRST_NAMES);
	const lastNames = rng.shuffle(LAST_NAMES);
	const account = (i: number, role: Role, employeeId: string | null): PlanRow<'users'> => ({
		id: rng.uuid(),
		// the tag keeps addresses apart across sandboxes, app.users.email is unique over all tenants
		email: `${mailbox(firstNames[i]!)}.${mailbox(lastNames[i]!)}+${tag}@example.test`,
		displayName: `${firstNames[i]} ${lastNames[i]}`,
		role,
		locale: 'de',
		employeeId
	});

	const models = {
		full: { id: rng.uuid(), ...MODELS.full },
		part: { id: rng.uuid(), ...MODELS.part },
		threeDays: { id: rng.uuid(), ...MODELS.threeDays }
	};
	const teams: PlanRow<'teams'>[] = TEAMS.map((name) => ({
		id: rng.uuid(),
		name,
		leadUserIds: []
	}));
	const contracts: PlanRow<'contracts'>[] = [];

	const people = ROSTER.map((seat, i): Person => {
		const entryDate =
			seat.key === 'newcomer'
				? Temporal.PlainDate.from({ year, month: 3, day: 15 })
				: Temporal.PlainDate.from({
						year: year - 2 - rng.int(0, 11),
						month: rng.int(1, 12),
						day: 1
					});
		const exitDate = seat.key === 'leaver' ? endOfMonth(calendar.today.toPlainYearMonth()) : null;
		const employeeId = rng.uuid();
		const user = account(i, seat.role, employeeId);
		if (seat.role === 'team_lead') teams[seat.team]!.leadUserIds.push(user.id);

		const terms = [{ validFrom: entryDate, model: models[seat.model], days: '30.0', basis: 5 }];
		if (seat.key === 'switcher') {
			terms.push({
				validFrom: Temporal.PlainDate.from({ year, month: 7, day: 1 }),
				model: models.threeDays,
				days: '18.0',
				basis: 3
			});
		}
		for (const term of terms) {
			contracts.push({
				id: rng.uuid(),
				employeeId,
				validFrom: term.validFrom.toString(),
				workModelId: term.model.id,
				minutes: term.model.minutes,
				vacationDaysYear: term.days,
				vacationBasisDays: term.basis
			});
		}

		return {
			key: seat.key,
			team: seat.team,
			employee: {
				id: employeeId,
				personnelNo: '',
				firstName: firstNames[i]!,
				lastName: lastNames[i]!,
				teamId: teams[seat.team]!.id,
				entryDate: entryDate.toString(),
				exitDate: exitDate?.toString() ?? null
			},
			user,
			employment: {
				entryDate,
				exitDate,
				contracts: terms.map((term) => ({
					validFrom: term.validFrom,
					minutes: term.model.minutes,
					vacationDaysYear: parseDecimal(term.days),
					vacationBasisDays: term.basis,
					capOverride: null
				}))
			},
			drift: seat.drift,
			balance: seat.balance,
			carryover: seat.carryover,
			arrival: seat.model === 'part' ? rng.int(470, 510) : rng.int(440, 520)
		};
	});

	// personnel numbers follow the entry dates like they would have been handed out
	people
		.toSorted((a, b) => Temporal.PlainDate.compare(a.employment.entryDate, b.employment.entryDate))
		.forEach((person, i) => {
			person.employee.personnelNo = String(1001 + i);
		});

	return {
		...(Object.fromEntries(people.map((person) => [person.key, person])) as Record<Key, Person>),
		people,
		admin: account(ROSTER.length, 'admin', null),
		teams,
		workModels: Object.values(models),
		contracts
	};
}

// nobody decides on their own requests, a lead's go to hr
export function leadOf(cast: Cast, person: Person): PlanRow<'users'> {
	const lead = cast.people.find(
		(other) => other.team === person.team && other.user.role === 'team_lead'
	)!;
	return lead === person ? cast.hr.user : lead.user;
}

// bookings on one's own account need a second person, for hr that is the admin
export const officeOf = (cast: Cast, person: Person): PlanRow<'users'> =>
	person === cast.hr ? cast.admin : cast.hr.user;
