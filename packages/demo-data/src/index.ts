import type {
	AbsenceStatus,
	AbsenceType,
	ArbzgCode,
	CorrectionAction,
	CorrectionStatus,
	EndReason,
	EntrySource,
	FederalState,
	FlexBookingType,
	FlexCapMode,
	Locale,
	MonthClosingAction,
	NoticeChannel,
	Role,
	Totals,
	VacationEntryType,
	WeekdayMinutes
} from '@zeit/shared';
import type { Temporal } from 'temporal-polyfill';
import { calendarFor } from './calendar';
import { FLEX_CAP, settle } from './flex';
import { dayRows, openRequests, planLeave } from './leave';
import { Random } from './random';
import { acknowledge, fixedShifts, forgottenLeave, lateShifts, timesheets } from './shifts';
import { hire } from './staff';
import { bookVacation } from './vacation';

export type DemoOptions = {
	today: Temporal.PlainDate;
	seed: number;
};

// the shape MonthsService.close() writes, flex_checkpoint() reads the december one back
export type MonthSnapshot = {
	ruleVersions: string[];
	employees: Record<
		string,
		Totals & {
			flexBalanceMinutes: number;
			vacationDays: string;
			sickDays: string;
			openFindings: number;
		}
	>;
};

// rows as the database takes them: ids derived from the seed, dates and instants as iso strings
export type DemoPlan = {
	tenant: {
		id: string;
		name: string;
		slug: string;
		state: FederalState;
		flexCapPlusMinutes: number | null;
		flexCapMinusMinutes: number | null;
		flexCapMode: FlexCapMode;
	};
	teams: { id: string; name: string; leadUserIds: string[] }[];
	workModels: { id: string; name: string; minutes: WeekdayMinutes }[];
	employees: {
		id: string;
		personnelNo: string;
		firstName: string;
		lastName: string;
		teamId: string;
		entryDate: string;
		exitDate: string | null;
	}[];
	users: {
		id: string;
		email: string;
		displayName: string;
		role: Role;
		locale: Locale;
		employeeId: string | null;
	}[];
	contracts: {
		id: string;
		employeeId: string;
		validFrom: string;
		workModelId: string;
		minutes: WeekdayMinutes;
		vacationDaysYear: string;
		vacationBasisDays: number;
	}[];
	entries: {
		id: string;
		employeeId: string;
		startedAt: string;
		endedAt: string | null;
		endReason: EndReason | null;
		source: EntrySource;
	}[];
	corrections: {
		id: string;
		employeeId: string;
		action: CorrectionAction;
		targetEntryId: string | null;
		newStartedAt: string | null;
		newEndedAt: string | null;
		reason: string;
		status: CorrectionStatus;
		requestedBy: string;
		decidedBy: string | null;
		decidedAt: string | null;
		createdAt: string;
	}[];
	absences: {
		id: string;
		employeeId: string;
		type: AbsenceType;
		startDate: string;
		endDate: string;
		halfDayStart: boolean;
		halfDayEnd: boolean;
		status: AbsenceStatus;
		requestedBy: string;
		decidedBy: string | null;
		decidedAt: string | null;
		decisionNote: string | null;
		certificateConfirmedAt: string | null;
		certificateConfirmedBy: string | null;
		createdAt: string;
	}[];
	absenceDays: {
		id: string;
		employeeId: string;
		absenceId: string;
		date: string;
		portion: 0.5 | 1;
		targetMinutes: number;
		vacationDays: string;
		supersededAt: string | null;
		supersededBy: string | null;
	}[];
	vacationLedger: {
		id: string;
		employeeId: string;
		bucketYear: number;
		entryType: VacationEntryType;
		days: string;
		effectiveDate: string;
		absenceId: string | null;
		noticeId: string | null;
		reason: string | null;
		dedupeKey: string | null;
		createdBy: string | null;
		createdAt: string;
	}[];
	vacationNotices: {
		id: string;
		employeeId: string;
		bucketYear: number;
		remainingDays: string;
		deadline: string;
		sentAt: string;
		sentBy: string;
		channel: NoticeChannel;
		textVersion: string;
	}[];
	flexBookings: {
		id: string;
		employeeId: string;
		type: FlexBookingType;
		minutes: number;
		effectiveDate: string;
		reason: string;
		monthClosingId: string | null;
		createdBy: string | null;
		createdAt: string;
	}[];
	monthClosings: {
		id: string;
		// first day of the month, month_closings_month_check
		month: string;
		action: MonthClosingAction;
		reason: string | null;
		snapshot: MonthSnapshot | null;
		createdBy: string;
		createdAt: string;
	}[];
	findingAcks: {
		id: string;
		employeeId: string;
		workDate: string;
		ruleCode: ArbzgCode;
		ruleVersion: string;
		note: string;
		createdBy: string;
		createdAt: string;
	}[];
};

export type PlanRow<K extends keyof DemoPlan> = DemoPlan[K] extends readonly (infer Row)[]
	? Row
	: never;

export function generateDemo({ today, seed }: DemoOptions): DemoPlan {
	const rng = new Random(seed);
	const calendar = calendarFor(today);
	const tenantId = rng.uuid();
	// slug and mail addresses are unique over all tenants, a piece of the tenant id keeps sandboxes apart
	const tag = tenantId.slice(0, 8);
	const cast = hire(rng, calendar, tag);

	const fixed = fixedShifts(cast, calendar);
	const leaves = planLeave(rng, cast, calendar, fixed);
	const specials = [...fixed, ...lateShifts(rng, cast, calendar, leaves, fixed)];
	openRequests(rng, cast, calendar, leaves, specials);
	const sheets = timesheets(rng, cast, calendar, specials, leaves);
	const correction = forgottenLeave(rng, specials, sheets);
	const acks = acknowledge(rng, cast, calendar, sheets);
	const absenceDays = dayRows(rng, calendar, leaves);
	const { ledger, notices } = bookVacation(rng, cast, calendar, leaves, absenceDays);
	const { bookings, closings } = settle(rng, cast, calendar, sheets, leaves, absenceDays, acks);

	return {
		tenant: {
			id: tenantId,
			name: 'Musterbetrieb (Beispiel)',
			slug: `musterbetrieb-${tag}`,
			state: 'NW',
			flexCapPlusMinutes: FLEX_CAP.plusMinutes,
			flexCapMinusMinutes: FLEX_CAP.minusMinutes,
			flexCapMode: FLEX_CAP.mode
		},
		teams: cast.teams,
		workModels: cast.workModels,
		employees: cast.people.map((person) => person.employee),
		users: [...cast.people.map((person) => person.user), cast.admin],
		contracts: cast.contracts,
		entries: cast.people.flatMap((person) => sheets.get(person)!.entries),
		corrections: [correction],
		absences: leaves.map((leave) => leave.row),
		absenceDays,
		vacationLedger: ledger,
		vacationNotices: notices,
		flexBookings: bookings,
		monthClosings: closings,
		findingAcks: acks
	};
}
