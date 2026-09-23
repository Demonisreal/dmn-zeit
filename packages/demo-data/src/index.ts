import type {
	AbsenceStatus,
	AbsenceType,
	ArbzgCode,
	CorrectionAction,
	CorrectionStatus,
	EndReason,
	FederalState,
	FlexBookingType,
	Locale,
	MonthClosingAction,
	NoticeChannel,
	Role,
	VacationEntryType,
	WeekdayMinutes
} from '@zeit/shared';
import type { Temporal } from 'temporal-polyfill';

export type DemoOptions = {
	today: Temporal.PlainDate;
	seed: number;
};

// rows as the database takes them: ids derived from the seed, dates and instants as iso strings
export type DemoPlan = {
	tenant: { id: string; name: string; slug: string; state: FederalState };
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
	}[];
	vacationNotices: {
		id: string;
		employeeId: string;
		bucketYear: number;
		remainingDays: string;
		deadline: string;
		sentAt: string;
		channel: NoticeChannel;
	}[];
	flexBookings: {
		id: string;
		employeeId: string;
		type: FlexBookingType;
		minutes: number;
		effectiveDate: string;
		reason: string;
	}[];
	monthClosings: { id: string; month: string; action: MonthClosingAction; reason: string | null }[];
	findingAcks: {
		id: string;
		employeeId: string;
		workDate: string;
		ruleCode: ArbzgCode;
		ruleVersion: string;
		note: string;
	}[];
};

export const generateDemo: (options: DemoOptions) => DemoPlan = () => {
	throw new Error('not implemented');
};
