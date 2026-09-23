import { z } from 'zod';
import { instantSchema, isOrdered, isoDateSchema, orderIssue, uuidSchema } from './common';
import { roleSchema } from './roles';

export const auditSources = ['trigger', 'app'] as const;
export type AuditSource = (typeof auditSources)[number];

export const auditEntrySchema = z.object({
	id: z.string(),
	occurredAt: instantSchema,
	actorUserId: uuidSchema.nullable(),
	actorName: z.string().nullable(),
	actorRole: roleSchema.nullable(),
	source: z.enum(auditSources),
	action: z.string(),
	table: z.string().nullable(),
	rowId: uuidSchema.nullable(),
	subjectEmployeeId: uuidSchema.nullable(),
	// column -> [old, new], like the trigger writes it
	diff: z.record(z.string(), z.tuple([z.unknown(), z.unknown()])).nullable(),
	requestId: z.string().nullable(),
	ip: z.string().nullable()
});

export const auditQuerySchema = z
	.object({
		table: z
			.string()
			.regex(/^[a-z_]{1,63}$/)
			.optional(),
		row: uuidSchema.optional(),
		employee: uuidSchema.optional(),
		from: isoDateSchema.optional(),
		to: isoDateSchema.optional(),
		cursor: z.string().max(200).optional(),
		limit: z.coerce.number().pipe(z.int().min(1).max(200)).default(50)
	})
	.refine(isOrdered, orderIssue);

export const auditPageSchema = z.object({
	entries: z.array(auditEntrySchema),
	nextCursor: z.string().nullable()
});

export type AuditEntry = z.infer<typeof auditEntrySchema>;
export type AuditQuery = z.infer<typeof auditQuerySchema>;
export type AuditPage = z.infer<typeof auditPageSchema>;
