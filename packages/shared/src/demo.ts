import { z } from 'zod';
import { employeeRefSchema, instantSchema, uuidSchema } from './common';
import { roleSchema } from './roles';
import { locales } from './users';

export const createSandboxSchema = z.object({
	locale: z.enum(locales).default('de')
});

export const personaSchema = z.object({
	userId: uuidSchema,
	displayName: z.string(),
	role: roleSchema,
	employee: employeeRefSchema.nullable(),
	team: z.object({ id: uuidSchema, name: z.string() }).nullable(),
	current: z.boolean()
});

export const switchPersonaSchema = z.object({ userId: uuidSchema });

export const outboxMailSchema = z.object({
	id: uuidSchema,
	to: z.string(),
	subject: z.string(),
	text: z.string(),
	createdAt: instantSchema
});

export type CreateSandboxInput = z.infer<typeof createSandboxSchema>;
export type Persona = z.infer<typeof personaSchema>;
export type SwitchPersonaInput = z.infer<typeof switchPersonaSchema>;
export type OutboxMail = z.infer<typeof outboxMailSchema>;
