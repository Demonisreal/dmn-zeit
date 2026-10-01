import type { Totals } from '@zeit/shared';

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
