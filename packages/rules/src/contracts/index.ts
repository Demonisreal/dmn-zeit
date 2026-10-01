import { Temporal } from 'temporal-polyfill';
import type { Explanation } from '../explanation';
import type { Fraction } from '../fraction';
import type { Holiday } from '../holidays';

export type Weekday = 'mon' | 'tue' | 'wed' | 'thu' | 'fri' | 'sat' | 'sun';
export type WeekdayMinutes = Readonly<Record<Weekday, number>>;

export type FlexCap = {
	plusMinutes: number | null;
	minusMinutes: number | null;
};

export type Contract = {
	validFrom: Temporal.PlainDate;
	minutes: WeekdayMinutes;
	vacationDaysYear: Fraction;
	vacationBasisDays: number;
	capOverride: FlexCap | null;
};

export type Employment = {
	entryDate: Temporal.PlainDate;
	exitDate: Temporal.PlainDate | null;
	contracts: readonly Contract[];
};

export type Target = {
	minutes: number;
	explanation: Explanation;
};

const WEEKDAYS: readonly Weekday[] = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];

export const contractOn = (
	employment: Employment,
	date: Temporal.PlainDate
): Contract | undefined => {
	let found: Contract | undefined;
	for (const contract of employment.contracts) {
		if (Temporal.PlainDate.compare(contract.validFrom, date) > 0) {
			continue;
		}
		if (!found || Temporal.PlainDate.compare(contract.validFrom, found.validFrom) > 0) {
			found = contract;
		}
	}
	return found;
};

export const targetMinutes = (
	employment: Employment,
	date: Temporal.PlainDate,
	holiday: Holiday | null
): Target => {
	const { entryDate, exitDate } = employment;
	if (
		Temporal.PlainDate.compare(date, entryDate) < 0 ||
		(exitDate !== null && Temporal.PlainDate.compare(date, exitDate) > 0)
	) {
		return { minutes: 0, explanation: { key: 'target.outside_employment', params: {} } };
	}
	if (holiday?.portion === 1) {
		return { minutes: 0, explanation: { key: 'target.holiday', params: { code: holiday.code } } };
	}

	const contract = contractOn(employment, date);
	if (!contract) {
		return { minutes: 0, explanation: { key: 'target.no_contract', params: {} } };
	}
	const weekday = WEEKDAYS[date.dayOfWeek - 1]!;
	const minutes = contract.minutes[weekday];
	const validFrom = contract.validFrom.toString();

	if (holiday?.portion === 0.5) {
		const half = Math.round(minutes / 2);
		return {
			minutes: half,
			explanation: {
				key: 'target.half_holiday',
				params: { code: holiday.code, minutes: half, validFrom }
			}
		};
	}
	return {
		minutes,
		explanation: { key: 'target.workday', params: { weekday, minutes, validFrom } }
	};
};
