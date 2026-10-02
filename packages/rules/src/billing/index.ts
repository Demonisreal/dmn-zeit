import { Temporal } from 'temporal-polyfill';
import { wholeMinutes, type Span } from '../calendar';
import type { Explanation } from '../explanation';
import { compare, fraction, type Fraction } from '../fraction';
import { percentOf, roundDiv } from '../money';

export type RoundingMode = 'up' | 'nearest' | 'down';
export type TaxProfile = 'regular' | 'small_business';
export type TaxCategory =
	'standard' | 'reduced' | 'exempt' | 'reverse_charge' | 'outside_scope' | 'small_business';

export type RoundingRule = {
	incrementMinutes: number;
	mode: RoundingMode;
};

export type RoundingOverride = {
	incrementMinutes: number | null;
	mode: RoundingMode | null;
};

export type Rounded = {
	minutes: number;
	explanation: Explanation;
};

export type Rate = {
	id: string;
	clientId: string | null;
	projectId: string | null;
	taskId: string | null;
	employeeId: string | null;
	validFrom: Temporal.PlainDate;
	cents: bigint;
};

export type RateQuery = {
	clientId: string;
	projectId: string | null;
	taskId: string | null;
	employeeId: string;
	date: Temporal.PlainDate;
};

export type RateLevel =
	| 'task_employee'
	| 'task'
	| 'project_employee'
	| 'project'
	| 'client_employee'
	| 'client'
	| 'employee'
	| 'default';

export type ResolvedRate = {
	cents: bigint;
	level: RateLevel;
	rateId: string;
	explanation: Explanation;
};

export type ProjectEntry = Span & {
	id: string;
	employeeId: string;
	clientId: string;
	projectId: string;
	taskId: string | null;
	workday: Temporal.PlainDate;
	billable: boolean;
};

export type Cell = {
	employeeId: string;
	clientId: string;
	projectId: string;
	taskId: string | null;
	date: Temporal.PlainDate;
	billable: boolean;
	entryIds: readonly string[];
	rawMinutes: number;
	roundedMinutes: number;
	rounding: Explanation;
	rate: ResolvedRate | null;
};

export type Line = {
	projectId: string;
	taskId: string | null;
	serviceFrom: Temporal.PlainDate;
	serviceTo: Temporal.PlainDate;
	minutes: number;
	rateCents: bigint;
	netCents: bigint;
	taxCategory: TaxCategory;
	taxRateBp: number;
	entryIds: readonly string[];
};

export type TaxedAmount = Pick<Line, 'netCents' | 'taxCategory' | 'taxRateBp'>;

export type TaxGroup = {
	taxCategory: TaxCategory;
	taxRateBp: number;
	netCents: bigint;
	taxCents: bigint;
	explanation: Explanation;
};

export type Totals = {
	groups: TaxGroup[];
	netCents: bigint;
	taxCents: bigint;
	grossCents: bigint;
	explanation: Explanation;
};

export type VatRates = {
	validFrom: Temporal.PlainDate;
	standardBp: number;
	reducedBp: number;
};

export type SmallBusinessLimits = {
	validFrom: Temporal.PlainDate;
	previousYearCents: bigint;
	currentYearCents: bigint;
};

export type SmallBusinessCheck = {
	state: 'ok' | 'previous_year_exceeded' | 'crosses_current_limit';
	explanation: Explanation;
};

export type InvoiceForm = {
	legalNotes: string[];
	blockers: string[];
	hints: string[];
};

export type BudgetStatus = {
	state: 'ok' | 'warn' | 'exceeded';
	ratio: Fraction;
	explanation: Explanation;
};

const inForce = <T extends { validFrom: Temporal.PlainDate }>(
	sets: readonly T[],
	date: Temporal.PlainDate
): T =>
	sets
		.toSorted((a, b) => Temporal.PlainDate.compare(a.validFrom, b.validFrom))
		.reduce((current, set) =>
			Temporal.PlainDate.compare(set.validFrom, date) <= 0 ? set : current
		);

export const roundMinutes = (
	rawMinutes: number,
	{ increment, mode }: { increment: number; mode: RoundingMode }
): Rounded => {
	const below = Math.floor(rawMinutes / increment) * increment;
	const rest = rawMinutes - below;
	const minutes =
		rest > 0 && (mode === 'up' || (mode === 'nearest' && 2 * rest >= increment))
			? below + increment
			: below;
	return {
		minutes,
		explanation: {
			key: `billing.rounding.${mode}`,
			params: { raw: rawMinutes, increment, rounded: minutes }
		}
	};
};

const inherit = <T>(project: T | null, client: T | null, profile: T) => {
	if (project !== null) {
		return { value: project, from: 'project' };
	}
	if (client !== null) {
		return { value: client, from: 'client' };
	}
	return { value: profile, from: 'profile' };
};

export const roundingFor = (
	profile: RoundingRule,
	client: RoundingOverride,
	project: RoundingOverride
): { rule: RoundingRule; explanation: Explanation } => {
	const increment = inherit(
		project.incrementMinutes,
		client.incrementMinutes,
		profile.incrementMinutes
	);
	const mode = inherit(project.mode, client.mode, profile.mode);
	return {
		rule: { incrementMinutes: increment.value, mode: mode.value },
		explanation: {
			key: 'billing.rounding.rule',
			params: {
				incrementMinutes: increment.value,
				incrementFrom: increment.from,
				mode: mode.value,
				modeFrom: mode.from
			}
		}
	};
};

const RATE_LEVELS: readonly RateLevel[] = [
	'task_employee',
	'task',
	'project_employee',
	'project',
	'client_employee',
	'client',
	'employee',
	'default'
];

const levelOf = (rate: Rate, query: RateQuery): RateLevel | null => {
	const personal = rate.employeeId !== null;
	if (personal && rate.employeeId !== query.employeeId) {
		return null;
	}
	if (rate.taskId !== null) {
		return rate.taskId === query.taskId ? (personal ? 'task_employee' : 'task') : null;
	}
	if (rate.projectId !== null) {
		return rate.projectId === query.projectId ? (personal ? 'project_employee' : 'project') : null;
	}
	if (rate.clientId !== null) {
		return rate.clientId === query.clientId ? (personal ? 'client_employee' : 'client') : null;
	}
	return personal ? 'employee' : 'default';
};

export const resolveRate = (rates: readonly Rate[], query: RateQuery): ResolvedRate | null => {
	let best: { rate: Rate; level: RateLevel; rank: number } | undefined;
	for (const rate of rates) {
		const level = levelOf(rate, query);
		if (level === null || Temporal.PlainDate.compare(rate.validFrom, query.date) > 0) {
			continue;
		}
		const rank = RATE_LEVELS.indexOf(level);
		if (
			!best ||
			rank < best.rank ||
			(rank === best.rank && Temporal.PlainDate.compare(rate.validFrom, best.rate.validFrom) > 0)
		) {
			best = { rate, level, rank };
		}
	}
	if (!best) {
		return null;
	}
	const { rate, level } = best;
	return {
		cents: rate.cents,
		level,
		rateId: rate.id,
		explanation: {
			key: `billing.rate.${level}`,
			params: { cents: String(rate.cents), validFrom: rate.validFrom.toString() }
		}
	};
};

export const isBillable = (
	entry: { billable: boolean | null },
	task: { billable: boolean | null } | null,
	project: { billable: boolean }
): boolean => entry.billable ?? task?.billable ?? project.billable;

export const aggregate = (
	entries: readonly ProjectEntry[],
	context: { rates: readonly Rate[]; rounding: (projectId: string) => RoundingRule }
): Cell[] => {
	const cells = new Map<string, { first: ProjectEntry; entries: ProjectEntry[] }>();
	for (const entry of entries.toSorted((a, b) => Temporal.Instant.compare(a.start, b.start))) {
		const key = [
			entry.employeeId,
			entry.projectId,
			entry.taskId ?? '',
			entry.workday.toString(),
			entry.billable
		].join('|');
		const cell = cells.get(key);
		if (cell) {
			cell.entries.push(entry);
		} else {
			cells.set(key, { first: entry, entries: [entry] });
		}
	}

	return [...cells.values()].map(({ first, entries: booked }) => {
		const rawMinutes = wholeMinutes(booked);
		const rule = context.rounding(first.projectId);
		const rounded = roundMinutes(rawMinutes, { increment: rule.incrementMinutes, mode: rule.mode });
		return {
			employeeId: first.employeeId,
			clientId: first.clientId,
			projectId: first.projectId,
			taskId: first.taskId,
			date: first.workday,
			billable: first.billable,
			entryIds: booked.map((entry) => entry.id),
			rawMinutes,
			roundedMinutes: rounded.minutes,
			rounding: rounded.explanation,
			rate: resolveRate(context.rates, {
				clientId: first.clientId,
				projectId: first.projectId,
				taskId: first.taskId,
				employeeId: first.employeeId,
				date: first.workday
			})
		};
	});
};

export const linesFromCells = (cells: readonly Cell[], taxCategory: TaxCategory): Line[] => {
	const lines = new Map<string, Omit<Line, 'netCents' | 'entryIds'> & { entryIds: string[] }>();
	for (const cell of cells.toSorted((a, b) => Temporal.PlainDate.compare(a.date, b.date))) {
		if (!cell.billable || !cell.rate) {
			continue;
		}
		const taxRateBp = vatRateFor(taxCategory, cell.date);
		const key = [cell.projectId, cell.taskId ?? '', cell.rate.cents, taxRateBp].join('|');
		const line = lines.get(key);
		if (line) {
			line.serviceTo = cell.date;
			line.minutes += cell.roundedMinutes;
			line.entryIds.push(...cell.entryIds);
		} else {
			lines.set(key, {
				projectId: cell.projectId,
				taskId: cell.taskId,
				serviceFrom: cell.date,
				serviceTo: cell.date,
				minutes: cell.roundedMinutes,
				rateCents: cell.rate.cents,
				taxCategory,
				taxRateBp,
				entryIds: [...cell.entryIds]
			});
		}
	}
	return [...lines.values()].map((line) => ({
		...line,
		netCents: roundDiv(BigInt(line.minutes) * line.rateCents, 60n)
	}));
};

export const VAT_RATES: readonly VatRates[] = [
	{ validFrom: Temporal.PlainDate.from('2007-01-01'), standardBp: 1900, reducedBp: 700 },
	{ validFrom: Temporal.PlainDate.from('2020-07-01'), standardBp: 1600, reducedBp: 500 },
	{ validFrom: Temporal.PlainDate.from('2021-01-01'), standardBp: 1900, reducedBp: 700 }
];

export const vatRateFor = (category: TaxCategory, date: Temporal.PlainDate): number => {
	const rates = inForce(VAT_RATES, date);
	if (category === 'standard') {
		return rates.standardBp;
	}
	return category === 'reduced' ? rates.reducedBp : 0;
};

export const EU_COUNTRY_CODES: readonly string[] = [
	'AT',
	'BE',
	'BG',
	'CY',
	'CZ',
	'DK',
	'EE',
	'ES',
	'FI',
	'FR',
	'GR',
	'HR',
	'HU',
	'IE',
	'IT',
	'LT',
	'LU',
	'LV',
	'MT',
	'NL',
	'PL',
	'PT',
	'RO',
	'SE',
	'SI',
	'SK'
];

export const taxTreatment = (
	profile: { taxProfile: TaxProfile },
	client: { countryCode: string; isBusiness: boolean; vatId: string | null }
): TaxCategory => {
	if (profile.taxProfile === 'small_business') {
		return 'small_business';
	}
	if (client.countryCode === 'DE' || !client.isBusiness) {
		return 'standard';
	}
	if (EU_COUNTRY_CODES.includes(client.countryCode)) {
		return client.vatId !== null ? 'reverse_charge' : 'standard';
	}
	return 'outside_scope';
};

export const invoiceTotals = (lines: readonly TaxedAmount[]): Totals => {
	const sums = new Map<string, TaxedAmount>();
	for (const line of lines) {
		const key = `${line.taxCategory}|${line.taxRateBp}`;
		const sum = sums.get(key);
		if (sum) {
			sum.netCents += line.netCents;
		} else {
			sums.set(key, {
				taxCategory: line.taxCategory,
				taxRateBp: line.taxRateBp,
				netCents: line.netCents
			});
		}
	}

	const groups = [...sums.values()].map((sum) => {
		const taxCents = percentOf(sum.netCents, sum.taxRateBp);
		return {
			...sum,
			taxCents,
			explanation: {
				key: 'billing.totals.group',
				params: {
					taxCategory: sum.taxCategory,
					taxRateBp: sum.taxRateBp,
					netCents: String(sum.netCents),
					taxCents: String(taxCents)
				}
			}
		};
	});
	const netCents = groups.reduce((total, group) => total + group.netCents, 0n);
	const taxCents = groups.reduce((total, group) => total + group.taxCents, 0n);
	const grossCents = netCents + taxCents;
	return {
		groups,
		netCents,
		taxCents,
		grossCents,
		explanation: {
			key: 'billing.totals',
			params: {
				netCents: String(netCents),
				taxCents: String(taxCents),
				grossCents: String(grossCents)
			}
		}
	};
};

export const negateLines = (lines: readonly Line[]): Line[] =>
	lines.map((line) => ({ ...line, minutes: 0 - line.minutes, netCents: -line.netCents }));

export const SMALL_AMOUNT_LIMIT_CENTS = 25000n;

export const isSmallAmountInvoice = (grossCents: bigint, treatment: TaxCategory): boolean =>
	treatment !== 'reverse_charge' &&
	grossCents <= SMALL_AMOUNT_LIMIT_CENTS &&
	grossCents >= -SMALL_AMOUNT_LIMIT_CENTS;

export const SMALL_BUSINESS_LIMITS: readonly SmallBusinessLimits[] = [
	{
		validFrom: Temporal.PlainDate.from('2025-01-01'),
		previousYearCents: 2_500_000n,
		currentYearCents: 10_000_000n
	}
];

export const smallBusinessCheck = (input: {
	previousYearRevenueCents: bigint;
	issuedThisYearCents: bigint;
	draftCents: bigint;
	year: number;
}): SmallBusinessCheck => {
	const { previousYearRevenueCents, issuedThisYearCents, draftCents, year } = input;
	const limits = inForce(
		SMALL_BUSINESS_LIMITS,
		Temporal.PlainDate.from({ year, month: 1, day: 1 })
	);
	if (previousYearRevenueCents > limits.previousYearCents) {
		return {
			state: 'previous_year_exceeded',
			explanation: {
				key: 'billing.small_business.previous_year_exceeded',
				params: {
					previousYearRevenueCents: String(previousYearRevenueCents),
					limitCents: String(limits.previousYearCents)
				}
			}
		};
	}
	const withDraftCents = issuedThisYearCents + draftCents;
	const params = {
		issuedThisYearCents: String(issuedThisYearCents),
		withDraftCents: String(withDraftCents),
		limitCents: String(limits.currentYearCents)
	};
	if (withDraftCents <= limits.currentYearCents) {
		return { state: 'ok', explanation: { key: 'billing.small_business.ok', params } };
	}
	const key =
		issuedThisYearCents > limits.currentYearCents
			? 'billing.small_business.already_crossed'
			: 'billing.small_business.crosses_current_limit';
	return { state: 'crosses_current_limit', explanation: { key, params } };
};

export type PostalAddress = {
	street: string | null;
	postalCode: string | null;
	city: string | null;
};

const isComplete = (address: PostalAddress) =>
	Boolean(address.street && address.postalCode && address.city);

export const invoiceForm = (input: {
	kind: 'invoice' | 'cancellation';
	format: 'pdf' | 'zugferd' | 'xrechnung';
	grossCents: bigint;
	treatment: TaxCategory;
	isBusiness: boolean;
	profile: { hasVatId: boolean; hasTaxNumber: boolean };
	seller: PostalAddress;
	buyer: PostalAddress & { leitwegId: boolean };
}): InvoiceForm => {
	const { kind, format, grossCents, treatment, isBusiness, profile, seller, buyer } = input;
	const smallAmount = isSmallAmountInvoice(grossCents, treatment);
	const form: InvoiceForm = { legalNotes: [], blockers: [], hints: [] };
	if (treatment === 'small_business') {
		form.legalNotes.push('small_business_19');
	}
	if (treatment === 'exempt') {
		form.legalNotes.push('exempt_reason');
	}
	if (treatment === 'outside_scope') {
		form.legalNotes.push('outside_scope_3a');
	}
	if (treatment === 'reverse_charge') {
		form.legalNotes.push('reverse_charge_13b');
		form.hints.push('service_deadline_14a_1');
		if (!profile.hasVatId) {
			form.blockers.push('vat_id_missing');
		}
	} else if (
		!profile.hasTaxNumber &&
		(!profile.hasVatId || treatment === 'outside_scope') &&
		!smallAmount
	) {
		form.blockers.push('tax_number_missing');
	}
	if (!isComplete(seller)) {
		form.blockers.push('seller_address_incomplete');
	}
	if (!isComplete(buyer) && !smallAmount) {
		form.blockers.push('buyer_address_incomplete');
	}
	if (!isBusiness && kind === 'invoice') {
		form.legalNotes.push('late_payment_286_consumer');
	}
	if (buyer.leitwegId && format === 'pdf') {
		form.hints.push('public_buyer_wants_xrechnung');
	}
	return form;
};

const WARN_AT = fraction(4, 5);

export const budgetStatus = (usedMinutes: number, budgetMinutes: number): BudgetStatus => {
	const ratio = fraction(usedMinutes, budgetMinutes);
	const state =
		compare(ratio, fraction(1)) > 0 ? 'exceeded' : compare(ratio, WARN_AT) >= 0 ? 'warn' : 'ok';
	return {
		state,
		ratio,
		explanation: { key: `billing.budget.${state}`, params: { usedMinutes, budgetMinutes } }
	};
};
