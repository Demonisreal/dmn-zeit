import { Temporal } from 'temporal-polyfill';
import type { Employment } from '../contracts';
import type { Explanation } from '../explanation';
import {
	add,
	compare,
	floor,
	fraction,
	fractionalPart,
	min,
	multiply,
	subtract,
	toDecimal,
	type Fraction
} from '../fraction';
import type { Holiday } from '../holidays';

export type Entitlement = {
	exact: Fraction;
	// § 5 Abs. 2 BUrlG: from half a day up, never down
	rounded: Fraction;
	explanations: Explanation[];
};

export type VacationRange = {
	start: Temporal.PlainDate;
	end: Temporal.PlainDate;
	halfDayStart: boolean;
	halfDayEnd: boolean;
};

export type DayCost = {
	date: Temporal.PlainDate;
	portion: 0 | 0.5 | 1;
	targetMinutes: number;
	vacationDays: Fraction;
	explanation: Explanation;
};

export type Bucket = {
	year: number;
	remaining: Fraction;
	deadline: Temporal.PlainDate | null;
};

export type Allocation = {
	date: Temporal.PlainDate;
	year: number;
	days: Fraction;
};

export type AllocationPlan = {
	allocations: Allocation[];
	shortfall: Fraction;
};

export type Notice = {
	sentAt: Temporal.Instant;
	deadline: Temporal.PlainDate;
};

export type Expiry = {
	kind: 'not_due' | 'forfeit' | 'keep';
	days: Fraction;
	explanation: Explanation;
};

export type TakenDay = {
	date: Temporal.PlainDate;
	vacationDays: Fraction;
};

export type SickRefund = {
	days: Fraction;
	dates: Temporal.PlainDate[];
	explanation: Explanation;
};

type Contract = Employment['contracts'][number];

const WEEKDAYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'] as const;

const contractAt = (employment: Employment, date: Temporal.PlainDate): Contract | undefined => {
	let current: Contract | undefined;
	for (const contract of employment.contracts) {
		if (
			Temporal.PlainDate.compare(contract.validFrom, date) <= 0 &&
			(!current || Temporal.PlainDate.compare(contract.validFrom, current.validFrom) > 0)
		) {
			current = contract;
		}
	}
	return current;
};

const entitlement = (exact: Fraction, basis: Explanation, notes: Explanation[]): Entitlement => {
	if (compare(fractionalPart(exact), fraction(1, 2)) < 0) {
		return { exact, rounded: exact, explanations: [basis, ...notes] };
	}
	const rounded = fraction(floor(exact) + 1);
	return {
		exact,
		rounded,
		explanations: [
			basis,
			{
				key: 'vacation.entitlement.rounded_up',
				params: { exact: toDecimal(exact, 2), rounded: rounded.num }
			},
			...notes
		]
	};
};

export const annualEntitlement = (
	employment: Employment,
	year: number,
	asOf: Temporal.PlainDate
): Entitlement => {
	const newYear = Temporal.PlainDate.from({ year, month: 1, day: 1 });
	const newYearsEve = Temporal.PlainDate.from({ year, month: 12, day: 31 });
	const from =
		Temporal.PlainDate.compare(employment.entryDate, newYear) > 0 ? employment.entryDate : newYear;
	const employedTo =
		employment.exitDate && Temporal.PlainDate.compare(employment.exitDate, newYearsEve) < 0
			? employment.exitDate
			: newYearsEve;
	if (Temporal.PlainDate.compare(from, employedTo) > 0) {
		return entitlement(fraction(0), { key: 'vacation.entitlement.no_employment', params: {} }, []);
	}

	// § 4 BUrlG: full entitlement from this day on, but only once asOf has actually reached it
	const fullFrom = employment.entryDate.add({ months: 6 });
	const waitingPeriodMet =
		Temporal.PlainDate.compare(fullFrom, employedTo) <= 0 &&
		Temporal.PlainDate.compare(fullFrom, asOf) <= 0;
	const waitingPeriodRuns =
		Temporal.PlainDate.compare(asOf, fullFrom) < 0 &&
		(employment.exitDate === null ||
			Temporal.PlainDate.compare(fullFrom, employment.exitDate) <= 0);
	const notes: Explanation[] = waitingPeriodRuns
		? [
				{
					key: 'vacation.entitlement.waiting_period',
					params: { until: fullFrom.subtract({ days: 1 }).toString() }
				}
			]
		: [];

	// § 5 Abs. 1 Buchst. c BUrlG only cuts the entitlement for an exit up to 30 June; leaving
	// later with the waiting period already met keeps the full annual amount, no twelfths
	const exitsThisYear = employment.exitDate !== null && employment.exitDate.year === year;
	const fullOnExit = exitsThisYear && waitingPeriodMet && employedTo.month > 6;
	const to = fullOnExit ? newYearsEve : employedTo;

	const contract = contractAt(employment, from);
	const entersThisYear = employment.entryDate.year === year;
	const runsUninterrupted = (!entersThisYear && !exitsThisYear) || fullOnExit;
	if (runsUninterrupted && contract && contract === contractAt(employment, to)) {
		return entitlement(
			contract.vacationDaysYear,
			{
				key: fullOnExit ? 'vacation.entitlement.full_on_exit' : 'vacation.entitlement.full_year',
				params: { days: toDecimal(contract.vacationDaysYear, 2) }
			},
			notes
		);
	}

	// simplified § 5 Abs. 1 BUrlG: one employed day makes the whole calendar month count
	let exact = fraction(0);
	for (let month = from.month; month <= to.month; month++) {
		const firstDay = month === from.month ? from : from.with({ month, day: 1 });
		const monthContract = contractAt(employment, firstDay);
		if (monthContract) {
			exact = add(exact, multiply(monthContract.vacationDaysYear, fraction(1, 12)));
		}
	}
	return entitlement(
		exact,
		{
			key: fullOnExit ? 'vacation.entitlement.full_on_exit' : 'vacation.entitlement.pro_rata',
			params: { months: to.month - from.month + 1, days: toDecimal(exact, 2) }
		},
		notes
	);
};

const dayOff = (date: Temporal.PlainDate, key: string, params: Explanation['params']): DayCost => ({
	date,
	portion: 0,
	targetMinutes: 0,
	vacationDays: fraction(0),
	explanation: { key, params }
});

export const daysForRange = (
	range: VacationRange,
	employment: Employment,
	holidays: readonly Holiday[]
): DayCost[] => {
	const costs: DayCost[] = [];
	for (
		let date = range.start;
		Temporal.PlainDate.compare(date, range.end) <= 0;
		date = date.add({ days: 1 })
	) {
		const employed =
			Temporal.PlainDate.compare(date, employment.entryDate) >= 0 &&
			(employment.exitDate === null || Temporal.PlainDate.compare(date, employment.exitDate) <= 0);
		const contract = employed ? contractAt(employment, date) : undefined;
		const holiday = holidays.find((day) => day.portion === 1 && day.date.equals(date));
		const halfHoliday = holidays.find((day) => day.portion === 0.5 && day.date.equals(date));
		// dayOfWeek is ISO, 1 is Monday
		const minutes = contract ? contract.minutes[WEEKDAYS[date.dayOfWeek - 1]!] : 0;

		if (!contract) {
			costs.push(dayOff(date, 'vacation.day.outside_employment', {}));
		} else if (holiday) {
			costs.push(dayOff(date, 'vacation.day.holiday', { code: holiday.code }));
		} else if (minutes === 0) {
			costs.push(dayOff(date, 'vacation.day.non_working_day', {}));
		} else if (halfHoliday) {
			// the holiday already covers half the day, vacation only pays for the other half
			costs.push({
				date,
				portion: 0.5,
				targetMinutes: Math.round(minutes / 2),
				vacationDays: fraction(1, 2),
				explanation: { key: 'vacation.day.half_holiday', params: { code: halfHoliday.code } }
			});
		} else {
			const half =
				(range.halfDayStart && date.equals(range.start)) ||
				(range.halfDayEnd && date.equals(range.end));
			const portion = half ? 0.5 : 1;
			costs.push({
				date,
				portion,
				targetMinutes: half ? Math.round(minutes / 2) : minutes,
				vacationDays: half ? fraction(1, 2) : fraction(1),
				explanation: { key: 'vacation.day.workday', params: { portion } }
			});
		}
	}
	return costs;
};

// a bucket pays from 1 january of its year through its deadline, none means no expiry
const paysOn = (bucket: Bucket, date: Temporal.PlainDate) =>
	date.year >= bucket.year &&
	(bucket.deadline === null || Temporal.PlainDate.compare(date, bucket.deadline) <= 0);

export const allocate = (days: readonly TakenDay[], buckets: readonly Bucket[]): AllocationPlan => {
	const balances = buckets
		.toSorted((a, b) => {
			if (a.deadline === null) {
				return b.deadline === null ? 0 : 1;
			}
			if (b.deadline === null) {
				return -1;
			}
			return Temporal.PlainDate.compare(a.deadline, b.deadline);
		})
		.map((bucket) => ({ bucket, left: bucket.remaining }));

	const allocations: Allocation[] = [];
	let shortfall = fraction(0);
	// earliest day first, a later day could otherwise drain a bucket the earlier day depends on
	for (const day of days.toSorted((a, b) => Temporal.PlainDate.compare(a.date, b.date))) {
		let missing = day.vacationDays;
		for (const balance of balances) {
			if (!paysOn(balance.bucket, day.date)) {
				continue;
			}
			const drawn = min(balance.left, missing);
			if (compare(drawn, fraction(0)) > 0) {
				allocations.push({ date: day.date, year: balance.bucket.year, days: drawn });
				balance.left = subtract(balance.left, drawn);
				missing = subtract(missing, drawn);
			}
		}
		shortfall = add(shortfall, missing);
	}
	return { allocations, shortfall };
};

export const expiryDecision = (
	bucket: Bucket,
	notice: Notice | null,
	today: Temporal.PlainDate
): Expiry => {
	if (bucket.deadline === null) {
		return {
			kind: 'not_due',
			days: bucket.remaining,
			explanation: { key: 'vacation.expiry.not_due', params: {} }
		};
	}
	// a notice can push the deadline back, never pull it in ahead of § 7 Abs. 3 BUrlG
	const deadline =
		notice && Temporal.PlainDate.compare(notice.deadline, bucket.deadline) > 0
			? notice.deadline
			: bucket.deadline;
	// the deadline day itself is still usable, forfeiture only starts the day after
	if (Temporal.PlainDate.compare(today, deadline) <= 0) {
		return {
			kind: 'not_due',
			days: bucket.remaining,
			explanation: { key: 'vacation.expiry.not_due', params: {} }
		};
	}
	// BAG since 2019: without the employer's notice the days do not expire
	if (notice === null) {
		return {
			kind: 'keep',
			days: bucket.remaining,
			explanation: { key: 'vacation.expiry.no_notice', params: {} }
		};
	}
	return {
		kind: 'forfeit',
		days: bucket.remaining,
		explanation: { key: 'vacation.expiry.forfeited', params: { deadline: deadline.toString() } }
	};
};

export const sickRefund = (
	taken: readonly TakenDay[],
	sickDates: readonly Temporal.PlainDate[]
): SickRefund => {
	const refunded = taken
		.filter((day) => sickDates.some((sick) => sick.equals(day.date)))
		.toSorted((a, b) => Temporal.PlainDate.compare(a.date, b.date));
	const days = refunded.reduce((sum, day) => add(sum, day.vacationDays), fraction(0));
	const dates = refunded.map((day) => day.date);
	return {
		days,
		dates,
		explanation: {
			key: 'vacation.sick_refund',
			params: { days: toDecimal(days, 2), count: dates.length }
		}
	};
};
