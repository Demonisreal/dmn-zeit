import type { Locale } from '@zeit/shared';

// deliberately narrower than exports/exports.service.ts#timesheetRows (befund B9): only the
// billing-relevant project bookings of one customer/project, never absences or other customers
export type TimeReportEntry = {
	date: string;
	projectName: string;
	taskName: string | null;
	note: string | null;
	minutes: number;
	billable: boolean;
};

export type TimeReport = {
	locale: Locale;
	client: { name: string; number: string | null };
	project: { name: string; code: string } | null;
	period: { from: string; to: string };
	generatedAt: string;
	entries: TimeReportEntry[];
	totals: { minutes: number; billableMinutes: number };
};
