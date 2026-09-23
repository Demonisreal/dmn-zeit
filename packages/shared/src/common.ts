import { z } from 'zod';

export const uuidSchema = z.uuid();
export const isoDateSchema = z.iso.date();
// stamps always carry their offset, otherwise the day of a shift depends on the reader's zone
export const instantSchema = z.iso.datetime({ offset: true });
export const monthSchema = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, 'format.month');
export const yearSchema = z.int().min(2000).max(2100);
export const queryYearSchema = z.coerce.number().pipe(yearSchema);

// numeric(5,2) leaves pg as a string, keeping it one spares the client float drift
export const dayCountSchema = z.string().regex(/^-?\d{1,3}\.\d{2}$/, 'format.dayCount');
export const portionSchema = z.literal([0.5, 1]);

export const emailSchema = z.string().trim().max(254).pipe(z.email());
export const displayNameSchema = z.string().trim().min(1).max(80);
export const reasonSchema = z.string().trim().min(10).max(1000);
export const noteSchema = z.string().trim().min(1).max(500);
export const capMinutesSchema = z.int().min(0).max(60000);

export const requestScopes = ['mine', 'inbox', 'all'] as const;
export type RequestScope = (typeof requestScopes)[number];

export const explanationSchema = z.object({
	key: z.string(),
	params: z.record(z.string(), z.union([z.string(), z.number()]))
});

export const employeeRefSchema = z.object({ id: uuidSchema, name: z.string() });
export const userRefSchema = z.object({ id: uuidSchema, displayName: z.string() });

// writes have to be sent as json for the csrf check, even when there is nothing to send
export const emptyBodySchema = z.strictObject({});

export const approveSchema = z.object({ note: noteSchema.optional() });
export const rejectSchema = z.object({ note: noteSchema });

export const rangeShape = { from: isoDateSchema, to: isoDateSchema };

const DAY_MS = 86_400_000;

// iso dates parse as utc midnight and compare correctly as strings
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

// ?status=a,b and ?status=a&status=b both arrive as a list
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
