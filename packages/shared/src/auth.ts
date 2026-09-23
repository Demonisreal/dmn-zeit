import { z } from 'zod';
import { emailSchema, instantSchema, uuidSchema } from './common';
import { tenantKinds } from './tenant';
import { userSchema } from './users';

// length only, the server also checks the list of common passwords
export const passwordSchema = z.string().min(12).max(128);
// 32 random bytes as base64url without padding
export const tokenSchema = z.string().regex(/^[A-Za-z0-9_-]{43}$/, 'Malformed token');

export const loginSchema = z.object({
	email: emailSchema,
	password: z.string().min(1).max(128)
});

export const forgotPasswordSchema = z.object({ email: emailSchema });

export const resetPasswordSchema = z.object({
	token: tokenSchema,
	password: passwordSchema
});

export const inspectInvitationSchema = z.object({ token: tokenSchema });

export const acceptInvitationSchema = z.object({
	token: tokenSchema,
	password: passwordSchema
});

export const changePasswordSchema = z.object({
	currentPassword: z.string().min(1).max(128),
	newPassword: passwordSchema
});

export const invitationSchema = z.object({
	email: z.string(),
	displayName: z.string(),
	tenantName: z.string()
});

export const sessionSchema = z.object({
	user: userSchema,
	tenant: z.object({
		id: uuidSchema,
		name: z.string(),
		kind: z.enum(tenantKinds),
		expiresAt: instantSchema.nullable()
	}),
	csrfToken: z.string()
});

export const activeSessionSchema = z.object({
	id: uuidSchema,
	createdAt: instantSchema,
	lastSeenAt: instantSchema,
	ip: z.string().nullable(),
	userAgent: z.string().nullable(),
	current: z.boolean()
});

export type LoginInput = z.infer<typeof loginSchema>;
export type ForgotPasswordInput = z.infer<typeof forgotPasswordSchema>;
export type ResetPasswordInput = z.infer<typeof resetPasswordSchema>;
export type InspectInvitationInput = z.infer<typeof inspectInvitationSchema>;
export type AcceptInvitationInput = z.infer<typeof acceptInvitationSchema>;
export type ChangePasswordInput = z.infer<typeof changePasswordSchema>;
export type Invitation = z.infer<typeof invitationSchema>;
export type Session = z.infer<typeof sessionSchema>;
export type ActiveSession = z.infer<typeof activeSessionSchema>;
