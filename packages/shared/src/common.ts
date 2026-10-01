import { z } from 'zod';

const YEAR_MIN = 1900;
const YEAR_MAX = 2100;

const yearInBounds = (raw: string) => {
	const year = Number(raw.slice(0, 4));
	return year >= YEAR_MIN && year <= YEAR_MAX;
};

export const uuidSchema = z.uuid();
export const isoDateSchema = z.iso.date().refine(yearInBounds, 'format.date');
export const instantSchema = z.iso.datetime({ offset: true }).refine(yearInBounds, 'format.date');
export const monthSchema = z
	.string()
	.regex(/^\d{4}-(0[1-9]|1[0-2])$/, 'format.month')
	.refine(yearInBounds, 'format.month');
export const yearSchema = z.int().min(2000).max(2100);
export const queryYearSchema = z.coerce.number().pipe(yearSchema);

export const dayCountSchema = z.string().regex(/^-?\d{1,3}\.\d{2}$/, 'format.dayCount');
export const portionSchema = z.literal([0.5, 1]);
export const centsSchema = z.string().regex(/^-?\d{1,15}$/, 'format.cents');

const CONTROL = /\p{Cc}/u;
const CONTROL_BUT_NEWLINE = /(?!\n)\p{Cc}/u;
const HIDDEN = /[\u2028\u2029\u202a-\u202e\u2066-\u2069\ufffe\uffff]/;
const LONE_SURROGATE = /[\ud800-\udbff](?![\udc00-\udfff])|(?<![\ud800-\udbff])[\udc00-\udfff]/;
const EDGES = /^[\s\u200b-\u200d\ufeff]+|[\s\u200b-\u200d\ufeff]+$/g;

function text(
	max: number,
	min: number,
	control: RegExp,
	prepare: (raw: string) => string,
	charset?: RegExp
) {
	return z
		.string()
		.transform((raw) => prepare(raw).normalize('NFC').replace(EDGES, ''))
		.pipe(
			z
				.string()
				.refine((clean) => clean.length > 0, { error: 'text.empty', abort: true })
				.min(min)
				.max(max)
				.refine(
					(clean) => !control.test(clean) && !HIDDEN.test(clean) && !LONE_SURROGATE.test(clean),
					{ error: 'text.controlChars', abort: true }
				)
				.refine((clean) => charset === undefined || charset.test(clean), 'text.invoiceCharset')
		);
}

export const plainText = (max: number, min = 1) => text(max, min, CONTROL, (raw) => raw);
export const multilineText = (max: number, min = 1) =>
	text(max, min, CONTROL_BUT_NEWLINE, (raw) => raw.replace(/\r\n?/g, '\n'));

const INVOICE_CHARSET =
	/^[\u0020-\u007e\u00a0-\u017f\u20ac\u2013\u2014\u2018\u2019\u201a\u201c\u201d\u201e\u2022\u2026]*$/u;
const INVOICE_CHARSET_MULTILINE =
	/^[\n\u0020-\u007e\u00a0-\u017f\u20ac\u2013\u2014\u2018\u2019\u201a\u201c\u201d\u201e\u2022\u2026]*$/u;
export const invoicePlainText = (max: number, min = 1) =>
	text(max, min, CONTROL, (raw) => raw, INVOICE_CHARSET);
export const invoiceMultilineText = (max: number, min = 1) =>
	text(
		max,
		min,
		CONTROL_BUT_NEWLINE,
		(raw) => raw.replace(/\r\n?/g, '\n'),
		INVOICE_CHARSET_MULTILINE
	);

export const emailSchema = z.string().trim().toLowerCase().max(254).pipe(z.email());
export const displayNameSchema = plainText(80);
export const reasonSchema = multilineText(1000, 10);
export const noteSchema = multilineText(500);
export const capMinutesSchema = z.int().min(0).max(60000);

export const requestScopes = ['mine', 'inbox', 'all'] as const;
export type RequestScope = (typeof requestScopes)[number];

export const workspaceKinds = ['company', 'solo'] as const;
export type WorkspaceKind = (typeof workspaceKinds)[number];

export const explanationSchema = z.object({
	key: z.string(),
	params: z.record(z.string(), z.union([z.string(), z.number()]))
});

export const employeeRefSchema = z.object({ id: uuidSchema, name: z.string() });
export const userRefSchema = z.object({ id: uuidSchema, displayName: z.string() });

export const emptyBodySchema = z.strictObject({});

export const approveSchema = z.object({ note: noteSchema.optional() });
export const rejectSchema = z.object({ note: noteSchema });

export const rangeShape = { from: isoDateSchema, to: isoDateSchema };

const DAY_MS = 86_400_000;

export const inRange =
	(maxDays: number) => (range: { from: string; to: string }, ctx: z.RefinementCtx) => {
		if (range.from > range.to) {
			ctx.addIssue({ code: 'custom', message: 'range.unordered', path: ['to'] });
		} else if ((Date.parse(range.to) - Date.parse(range.from)) / DAY_MS + 1 > maxDays) {
			ctx.addIssue({
				code: 'custom',
				message: 'range.tooLong',
				path: ['to'],
				params: { max: maxDays }
			});
		}
	};

export const queryList = <const T extends readonly [string, ...string[]]>(values: T) =>
	z
		.preprocess((raw) => (typeof raw === 'string' ? raw.split(',') : raw), z.array(z.enum(values)))
		.optional();

export const pagingShape = {
	cursor: z.string().max(200).optional(),
	limit: z.coerce.number().pipe(z.int().min(1).max(200)).default(50)
};

export const pageOf = <T extends z.ZodType>(item: T) =>
	z.object({ items: z.array(item), nextCursor: z.string().nullable() });

export type Explanation = z.infer<typeof explanationSchema>;
export type EmployeeRef = z.infer<typeof employeeRefSchema>;
export type UserRef = z.infer<typeof userRefSchema>;
export type ApproveInput = z.infer<typeof approveSchema>;
export type RejectInput = z.infer<typeof rejectSchema>;
