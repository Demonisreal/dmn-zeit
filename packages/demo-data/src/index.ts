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
	InvoiceFormat,
	InvoiceKind,
	InvoiceLine,
	InvoiceLineKind,
	InvoiceLineUnit,
	InvoiceStatus,
	Locale,
	MonthClosingAction,
	NoticeChannel,
	Role,
	RoundingMode,
	TaxCategory,
	TaxProfile,
	Totals,
	VacationEntryType,
	WeekdayMinutes
} from '@zeit/shared';
import type { Temporal } from 'temporal-polyfill';
import { calendarFor } from './calendar';
import { FLEX_CAP, settle } from './flex';
import { dayRows, openRequests, planLeave } from './leave';
import { bookProjects } from './projects';
import { Random } from './random';
import { acknowledge, fixedShifts, forgottenLeave, lateShifts, timesheets } from './shifts';
import { soloWorld } from './solo';
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

// clients and project time, the company and the solo workspace each get their own
export type ProjectBook = {
	clients: {
		id: string;
		number: string | null;
		name: string;
		street: string | null;
		postalCode: string | null;
		city: string | null;
		countryCode: string;
		isBusiness: boolean;
		vatId: string | null;
		email: string | null;
		buyerReference: string | null;
		invoiceLocale: Locale;
		paymentTermsDays: number | null;
		roundingIncrementMin: number | null;
		roundingMode: RoundingMode | null;
	}[];
	projects: {
		id: string;
		clientId: string;
		name: string;
		code: string | null;
		budgetMinutes: number | null;
	}[];
	tasks: { id: string; clientId: string; projectId: string; name: string }[];
	rates: {
		id: string;
		clientId: string | null;
		projectId: string | null;
		taskId: string | null;
		employeeId: string | null;
		validFrom: string;
		rateCents: number;
	}[];
	projectEntries: {
		id: string;
		employeeId: string;
		projectId: string;
		taskId: string | null;
		startedAt: string;
		endedAt: string | null;
		note: string | null;
		invoiceId: string | null;
	}[];
	billingProfile: {
		legalName: string;
		street: string | null;
		postalCode: string | null;
		city: string | null;
		countryCode: 'DE';
		taxNumber: string | null;
		vatId: string | null;
		taxProfile: TaxProfile;
		previousYearRevenueCents: number | null;
		iban: string | null;
		bic: string | null;
		bankName: string | null;
		contactName: string | null;
		contactEmail: string | null;
		contactPhone: string | null;
		registerCourt: string | null;
		registerNumber: string | null;
		invoicePrefix: string;
		paymentTermsDays: number;
		roundingIncrementMin: number;
		roundingMode: RoundingMode;
		defaultFormat: InvoiceFormat;
	};
	invoiceCounters: { year: number; lastSeq: number }[];
	invoices: {
		id: string;
		kind: InvoiceKind;
		status: InvoiceStatus;
		clientId: string;
		refersToId: string | null;
		number: string | null;
		numberYear: number | null;
		numberSeq: number | null;
		issueDate: string | null;
		dueDate: string | null;
		serviceFrom: string;
		serviceTo: string;
		paymentTermsDays: number;
		locale: Locale;
		format: InvoiceFormat;
		taxProfile: TaxProfile;
		taxTreatment: TaxCategory;
		seller: SellerSnapshot | null;
		buyer: BuyerSnapshot | null;
		introText: string | null;
		closingText: string | null;
		netCents: number;
		taxCents: number;
		grossCents: number;
		paidOn: string | null;
		cancelReason: string | null;
		cancelledAt: string | null;
		cancelledBy: string | null;
		issuedAt: string | null;
		issuedBy: string | null;
		createdBy: string;
		createdAt: string;
		lines: {
			id: string;
			position: number;
			kind: InvoiceLineKind;
			projectId: string | null;
			taskId: string | null;
			description: string;
			serviceFrom: string | null;
			serviceTo: string | null;
			minutes: number | null;
			quantityMilli: number | null;
			unit: InvoiceLineUnit | null;
			unitPriceCents: number;
			netCents: number;
			taxCategory: TaxCategory;
			taxRateBp: number;
			exemptionReason: string | null;
			derivation: InvoiceLine['derivation'] | null;
			entryIds: string[];
		}[];
	}[];
};

export type SellerSnapshot = Pick<
	ProjectBook['billingProfile'],
	| 'legalName'
	| 'street'
	| 'postalCode'
	| 'city'
	| 'countryCode'
	| 'taxNumber'
	| 'vatId'
	| 'iban'
	| 'bic'
	| 'bankName'
	| 'contactName'
	| 'contactEmail'
	| 'contactPhone'
	| 'registerCourt'
	| 'registerNumber'
>;

export type BuyerSnapshot = {
	name: string;
	street: string | null;
	postalCode: string | null;
	city: string | null;
	countryCode: string;
	isBusiness: boolean;
	vatId: string | null;
	email: string | null;
	buyerReference: string | null;
	number: string | null;
};

// the freelancer next door, one person who is admin of her own workspace
export type SoloPlan = ProjectBook & {
	tenant: { id: string; name: string; slug: string; state: FederalState };
	employee: {
		id: string;
		personnelNo: string;
		firstName: string;
		lastName: string;
		entryDate: string;
	};
	user: { id: string; email: string; displayName: string };
};

// rows as the database takes them: ids derived from the seed, dates and instants as iso strings
export type DemoPlan = ProjectBook & {
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
	solo: SoloPlan;
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
	// drawn last, so the projects leave every row of the story above as it was
	const book = bookProjects(rng, cast, calendar, sheets, leaves);
	const solo = soloWorld(rng, calendar);

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
		findingAcks: acks,
		...book,
		solo
	};
}
