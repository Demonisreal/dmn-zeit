import { z } from 'zod';
import {
	centsSchema,
	emailSchema,
	explanationSchema,
	inRange,
	instantSchema,
	invoiceMultilineText,
	invoicePlainText,
	isoDateSchema,
	pageOf,
	pagingShape,
	plainText,
	queryList,
	queryYearSchema,
	rangeShape,
	reasonSchema,
	uuidSchema,
	userRefSchema,
	yearSchema
} from './common';
import { roundingIncrementSchema, roundingModes } from './projects';
import { locales } from './users';

export const taxProfiles = ['regular', 'small_business'] as const;
export type TaxProfile = (typeof taxProfiles)[number];

export const taxCategories = [
	'standard',
	'reduced',
	'exempt',
	'reverse_charge',
	'outside_scope',
	'small_business'
] as const;
export type TaxCategory = (typeof taxCategories)[number];

export const invoiceKinds = ['invoice', 'cancellation'] as const;
export type InvoiceKind = (typeof invoiceKinds)[number];

export const invoiceStatuses = ['draft', 'issued', 'paid', 'cancelled'] as const;
export type InvoiceStatus = (typeof invoiceStatuses)[number];

export const invoiceFormats = ['pdf', 'zugferd', 'xrechnung'] as const;
export type InvoiceFormat = (typeof invoiceFormats)[number];

export const invoiceLineKinds = ['time', 'item'] as const;
export type InvoiceLineKind = (typeof invoiceLineKinds)[number];

export const invoiceLineUnits = ['HUR', 'DAY', 'C62', 'LS'] as const;
export type InvoiceLineUnit = (typeof invoiceLineUnits)[number];

const countryCodeSchema = z.literal('DE');

export const vatIdSchema = z.string().regex(/^DE[0-9]{9}$/, 'format.vatId');

function ibanChecksumValid(iban: string): boolean {
	const rearranged = iban.slice(4) + iban.slice(0, 4);
	const digits = rearranged.replace(/[A-Z]/g, (letter) => String(letter.charCodeAt(0) - 55));
	let remainder = 0;
	for (const digit of digits) {
		remainder = (remainder * 10 + Number(digit)) % 97;
	}
	return remainder === 1;
}

export const ibanSchema = z
	.string()
	.transform((raw) => raw.replace(/\s+/g, '').toUpperCase())
	.pipe(
		z
			.string()
			.regex(/^[A-Z]{2}[0-9]{2}[A-Z0-9]{11,30}$/, 'format.iban')
			.refine(ibanChecksumValid, 'format.iban')
	);

export const bicSchema = z
	.string()
	.transform((raw) => raw.replace(/\s+/g, '').toUpperCase())
	.pipe(z.string().regex(/^[A-Z]{6}[A-Z0-9]{2}([A-Z0-9]{3})?$/));

export const invoicePrefixSchema = z.string().regex(/^[A-Z0-9-]{0,10}$/);

const quantityMilliSchema = z.string().regex(/^-?\d{1,15}$/);
const positiveQuantityMilliSchema = z.string().regex(/^[1-9]\d{0,8}$/);
const unitPriceCentsSchema = z.string().regex(/^-?\d{1,9}$/, 'format.cents');

export const billingProfileSchema = z.object({
	legalName: z.string(),
	street: z.string().nullable(),
	postalCode: z.string().nullable(),
	city: z.string().nullable(),
	countryCode: countryCodeSchema,
	taxNumber: z.string().nullable(),
	vatId: z.string().nullable(),
	taxProfile: z.enum(taxProfiles),
	previousYearRevenueCents: centsSchema.nullable(),
	iban: z.string().nullable(),
	bic: z.string().nullable(),
	bankName: z.string().nullable(),
	contactName: z.string().nullable(),
	contactEmail: z.string().nullable(),
	contactPhone: z.string().nullable(),
	registerCourt: z.string().nullable(),
	registerNumber: z.string().nullable(),
	invoicePrefix: z.string(),
	paymentTermsDays: z.int(),
	roundingIncrementMin: roundingIncrementSchema,
	roundingMode: z.enum(roundingModes),
	defaultFormat: z.enum(invoiceFormats)
});

export const updateBillingProfileSchema = z.strictObject({
	legalName: invoicePlainText(200),
	street: invoicePlainText(120).nullable(),
	postalCode: invoicePlainText(10).nullable(),
	city: invoicePlainText(80).nullable(),
	taxNumber: invoicePlainText(20).nullable(),
	vatId: vatIdSchema.nullable(),
	taxProfile: z.enum(taxProfiles).default('regular'),
	previousYearRevenueCents: centsSchema.nullable(),
	iban: ibanSchema.nullable(),
	bic: bicSchema.nullable(),
	bankName: invoicePlainText(80).nullable(),
	contactName: plainText(120).nullable(),
	contactEmail: emailSchema.nullable(),
	contactPhone: plainText(30).nullable(),
	registerCourt: invoicePlainText(80).nullable(),
	registerNumber: invoicePlainText(30).nullable(),
	invoicePrefix: invoicePrefixSchema.default(''),
	paymentTermsDays: z.int().min(0).max(120).default(14),
	roundingIncrementMin: roundingIncrementSchema.default(15),
	roundingMode: z.enum(roundingModes).default('up'),
	defaultFormat: z.enum(invoiceFormats).default('pdf')
});

export const unbilledQuerySchema = z.strictObject({
	client: uuidSchema.optional(),
	to: isoDateSchema.optional()
});

export const unbilledSchema = z.array(
	z.object({
		clientId: uuidSchema,
		clientName: z.string(),
		minutes: z.int(),
		amountCents: centsSchema.nullable(),
		oldestDay: isoDateSchema
	})
);

export const revenueQuerySchema = z.strictObject({ year: queryYearSchema });

const smallBusinessStates = ['ok', 'previous_year_exceeded', 'crosses_current_limit'] as const;

export const revenueSchema = z.object({
	year: yearSchema,
	previousYearRevenueCents: centsSchema,
	issuedThisYearCents: centsSchema,
	draftCents: centsSchema,
	smallBusiness: z.object({
		state: z.enum(smallBusinessStates),
		explanation: explanationSchema
	})
});

export const invoiceListQuerySchema = z
	.strictObject({
		status: queryList(invoiceStatuses),
		client: uuidSchema.optional(),
		from: isoDateSchema.optional(),
		to: isoDateSchema.optional(),
		...pagingShape
	})
	.superRefine((query, ctx) => {
		if (query.from !== undefined && query.to !== undefined) {
			inRange(366)({ from: query.from, to: query.to }, ctx);
		}
	});

export const invoiceSummarySchema = z.object({
	id: uuidSchema,
	kind: z.enum(invoiceKinds),
	status: z.enum(invoiceStatuses),
	number: z.string().nullable(),
	clientId: uuidSchema,
	clientName: z.string(),
	issueDate: isoDateSchema.nullable(),
	dueDate: isoDateSchema.nullable(),
	grossCents: centsSchema,
	overdue: z.boolean(),
	format: z.enum(invoiceFormats)
});

export const invoicePageSchema = pageOf(invoiceSummarySchema);

const sellerSnapshotSchema = z.object({
	legalName: z.string(),
	street: z.string().nullable(),
	postalCode: z.string().nullable(),
	city: z.string().nullable(),
	countryCode: z.string(),
	taxNumber: z.string().nullable(),
	vatId: z.string().nullable(),
	iban: z.string().nullable(),
	bic: z.string().nullable(),
	bankName: z.string().nullable(),
	contactName: z.string().nullable(),
	contactEmail: z.string().nullable(),
	contactPhone: z.string().nullable(),
	registerCourt: z.string().nullable(),
	registerNumber: z.string().nullable()
});

const buyerSnapshotSchema = z.object({
	name: z.string(),
	street: z.string().nullable(),
	postalCode: z.string().nullable(),
	city: z.string().nullable(),
	countryCode: z.string(),
	isBusiness: z.boolean(),
	vatId: z.string().nullable(),
	email: z.string().nullable(),
	buyerReference: z.string().nullable(),
	number: z.string().nullable()
});

const invoiceLineDerivationSchema = z.object({
	entries: z.array(
		z.object({ id: uuidSchema, startedAt: instantSchema, endedAt: instantSchema.nullable() })
	),
	rounding: explanationSchema.nullable(),
	rate: z.object({ cents: centsSchema, explanation: explanationSchema }).nullable()
});

export const invoiceLineSchema = z.object({
	id: uuidSchema,
	position: z.int(),
	kind: z.enum(invoiceLineKinds),
	projectId: uuidSchema.nullable(),
	taskId: uuidSchema.nullable(),
	description: z.string(),
	serviceFrom: isoDateSchema.nullable(),
	serviceTo: isoDateSchema.nullable(),
	minutes: z.int().nullable(),
	quantityMilli: quantityMilliSchema.nullable(),
	unit: z.enum(invoiceLineUnits).nullable(),
	unitPriceCents: centsSchema.nullable(),
	netCents: centsSchema,
	taxCategory: z.enum(taxCategories),
	taxRateBp: z.int(),
	exemptionReason: z.string().nullable(),
	derivation: invoiceLineDerivationSchema
});

export const taxGroupSchema = z.object({
	taxCategory: z.enum(taxCategories),
	taxRateBp: z.int(),
	netCents: centsSchema,
	taxCents: centsSchema,
	explanation: explanationSchema
});

export const invoiceTotalsSchema = z.object({
	netCents: centsSchema,
	taxCents: centsSchema,
	grossCents: centsSchema,
	explanation: explanationSchema
});

const invoiceRefSchema = z.object({
	id: uuidSchema,
	number: z.string().nullable(),
	issueDate: isoDateSchema.nullable()
});

export const invoiceSchema = z.object({
	id: uuidSchema,
	kind: z.enum(invoiceKinds),
	status: z.enum(invoiceStatuses),
	specimen: z.boolean(),
	clientId: uuidSchema,
	refersTo: invoiceRefSchema.nullable(),
	number: z.string().nullable(),
	numberYear: z.int().nullable(),
	numberSeq: z.int().nullable(),
	issueDate: isoDateSchema.nullable(),
	dueDate: isoDateSchema.nullable(),
	serviceFrom: isoDateSchema,
	serviceTo: isoDateSchema,
	paymentTermsDays: z.int(),
	locale: z.enum(locales),
	format: z.enum(invoiceFormats),
	taxProfile: z.enum(taxProfiles),
	seller: sellerSnapshotSchema,
	buyer: buyerSnapshotSchema,
	introText: z.string().nullable(),
	closingText: z.string().nullable(),
	lines: z.array(invoiceLineSchema),
	taxGroups: z.array(taxGroupSchema),
	totals: invoiceTotalsSchema,
	legalNotes: z.array(z.string()),
	blockers: z.array(z.string()),
	hints: z.array(z.string()),
	paidOn: isoDateSchema.nullable(),
	cancelReason: z.string().nullable(),
	cancelledAt: instantSchema.nullable(),
	cancelledBy: userRefSchema.nullable(),
	issuedAt: instantSchema.nullable(),
	issuedBy: userRefSchema.nullable(),
	createdBy: userRefSchema.nullable(),
	createdAt: instantSchema,
	updatedAt: instantSchema,
	retainUntil: isoDateSchema.nullable()
});

export const invoicePeriodIssue = (range: {
	from: string;
	to: string;
}): 'range.unordered' | 'invoice.rangeTooLong' | null => {
	if (range.from > range.to) {
		return 'range.unordered';
	}
	return (Date.parse(range.to) - Date.parse(range.from)) / 86_400_000 + 1 > 366
		? 'invoice.rangeTooLong'
		: null;
};

const invoicePeriod = (range: { from: string; to: string }, ctx: z.RefinementCtx) => {
	const issue = invoicePeriodIssue(range);
	if (issue !== null) {
		ctx.addIssue({ code: 'custom', message: issue, path: ['to'] });
	}
};

export const createDraftSchema = z
	.strictObject({
		clientId: uuidSchema,
		from: isoDateSchema,
		to: isoDateSchema,
		projectIds: z.array(uuidSchema).max(50).optional()
	})
	.superRefine(invoicePeriod);

export const updateDraftSchema = z
	.strictObject({
		clientId: uuidSchema,
		from: isoDateSchema,
		to: isoDateSchema,
		introText: invoiceMultilineText(2000).nullable(),
		closingText: invoiceMultilineText(2000).nullable(),
		paymentTermsDays: z.int().min(0).max(120)
	})
	.partial()
	.superRefine((draft, ctx) => {
		if (draft.from !== undefined && draft.to !== undefined) {
			invoicePeriod({ from: draft.from, to: draft.to }, ctx);
		}
	});

export const invoiceLineInputSchema = z.strictObject({
	description: invoiceMultilineText(1000),
	quantityMilli: positiveQuantityMilliSchema,
	unit: z.enum(invoiceLineUnits),
	unitPriceCents: unitPriceCentsSchema,
	taxCategory: z.enum(taxCategories),
	exemptionReason: invoicePlainText(200).optional()
});

export const issueInvoiceSchema = z.strictObject({
	format: z.enum(invoiceFormats),
	longTimersChecked: z.boolean().optional()
});

export const cancelInvoiceSchema = z.strictObject({ reason: reasonSchema });

export const markPaidSchema = z.strictObject({ paidOn: isoDateSchema });

export const timeReportFormats = ['csv', 'pdf', 'json'] as const;

export const timeReportQuerySchema = z
	.strictObject({
		client: uuidSchema.optional(),
		...rangeShape,
		format: z.enum(timeReportFormats)
	})
	.superRefine(inRange(366));

export const invoiceTimeReportQuerySchema = z.strictObject({
	format: z.enum(['pdf', 'csv'])
});

export type CountryCode = z.infer<typeof countryCodeSchema>;
export type BillingProfile = z.infer<typeof billingProfileSchema>;
export type UpdateBillingProfileInput = z.infer<typeof updateBillingProfileSchema>;
export type UnbilledQuery = z.infer<typeof unbilledQuerySchema>;
export type Unbilled = z.infer<typeof unbilledSchema>;
export type RevenueQuery = z.infer<typeof revenueQuerySchema>;
export type Revenue = z.infer<typeof revenueSchema>;
export type InvoiceListQuery = z.infer<typeof invoiceListQuerySchema>;
export type InvoiceSummary = z.infer<typeof invoiceSummarySchema>;
export type InvoicePage = z.infer<typeof invoicePageSchema>;
export type InvoiceLine = z.infer<typeof invoiceLineSchema>;
export type TaxGroup = z.infer<typeof taxGroupSchema>;
export type InvoiceTotals = z.infer<typeof invoiceTotalsSchema>;
export type Invoice = z.infer<typeof invoiceSchema>;
export type CreateDraftInput = z.infer<typeof createDraftSchema>;
export type UpdateDraftInput = z.infer<typeof updateDraftSchema>;
export type InvoiceLineInput = z.infer<typeof invoiceLineInputSchema>;
export type IssueInvoiceInput = z.infer<typeof issueInvoiceSchema>;
export type CancelInvoiceInput = z.infer<typeof cancelInvoiceSchema>;
export type MarkPaidInput = z.infer<typeof markPaidSchema>;
export type TimeReportQuery = z.infer<typeof timeReportQuerySchema>;
export type InvoiceTimeReportQuery = z.infer<typeof invoiceTimeReportQuerySchema>;
