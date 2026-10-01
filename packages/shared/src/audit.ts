import { z } from 'zod';
import { inRange, instantSchema, pageOf, pagingShape, rangeShape, uuidSchema } from './common';
import { roleSchema } from './roles';

export const auditSources = ['trigger', 'app', 'cli'] as const;
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
	changes: z.record(z.string(), z.tuple([z.unknown(), z.unknown()])).nullable(),
	context: z.record(z.string(), z.unknown()).nullable(),
	requestId: uuidSchema.nullable(),
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
		...rangeShape,
		...pagingShape
	})
	.superRefine(inRange(366));

export const auditPageSchema = pageOf(auditEntrySchema);

export type AuditEntry = z.infer<typeof auditEntrySchema>;
export type AuditQuery = z.infer<typeof auditQuerySchema>;
export type AuditPage = z.infer<typeof auditPageSchema>;
