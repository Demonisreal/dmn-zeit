import type { Totals } from './index';

export const MAX_INVOICE_CENTS = 999_999_999_999_999n;

export type TotalBlocker = 'total_negative' | 'total_too_large';

export const totalBlockers = (totals: Totals): TotalBlocker[] => {
	const amounts = [
		totals.netCents,
		totals.taxCents,
		totals.grossCents,
		...totals.groups.flatMap((group) => [group.netCents, group.taxCents])
	];
	const blockers: TotalBlocker[] = [];
	if (totals.netCents < 0n || totals.grossCents < 0n) {
		blockers.push('total_negative');
	}
	if (amounts.some((cents) => cents > MAX_INVOICE_CENTS || cents < -MAX_INVOICE_CENTS)) {
		blockers.push('total_too_large');
	}
	return blockers;
};
