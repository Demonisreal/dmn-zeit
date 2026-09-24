import type { Totals } from '@zeit/shared';

// what one person stood at when the month was closed; the month overview reads it back as is
export type SnapshotRow = Totals & {
	flexBalanceMinutes: number;
	vacationDays: string;
	sickDays: string;
	openFindings: number;
};

export type MonthSnapshot = {
	ruleVersions: string[];
	employees: Record<string, SnapshotRow>;
};
