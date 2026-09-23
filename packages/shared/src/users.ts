import { z } from 'zod';
import { displayNameSchema, emailSchema, instantSchema, uuidSchema } from './common';
import { roleSchema } from './roles';

export const locales = ['de', 'en'] as const;
export type Locale = (typeof locales)[number];

export const userStatuses = ['invited', 'active', 'disabled', 'demo'] as const;
export type UserStatus = (typeof userStatuses)[number];

export const userSchema = z.object({
	id: uuidSchema,
	email: z.string(),
	displayName: z.string(),
	role: roleSchema,
	locale: z.enum(locales),
	status: z.enum(userStatuses),
	employeeId: uuidSchema.nullable(),
	lastLoginAt: instantSchema.nullable()
});

export const createUserSchema = z.object({
	email: emailSchema,
	displayName: displayNameSchema,
	role: roleSchema,
	locale: z.enum(locales).default('de'),
	employeeId: uuidSchema.nullable().default(null)
});

export const updateUserSchema = z
	.object({
		displayName: displayNameSchema,
		role: roleSchema,
		locale: z.enum(locales),
		employeeId: uuidSchema.nullable()
	})
	.partial();

export const updateMeSchema = z
	.object({
		displayName: displayNameSchema,
		locale: z.enum(locales)
	})
	.partial();

export type User = z.infer<typeof userSchema>;
export type CreateUserInput = z.infer<typeof createUserSchema>;
export type UpdateUserInput = z.infer<typeof updateUserSchema>;
export type UpdateMeInput = z.infer<typeof updateMeSchema>;
