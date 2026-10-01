import { z } from 'zod';
import { emailSchema, instantSchema, uuidSchema, workspaceKinds } from './common';
import { appModes } from './system';
import { tenantKinds } from './tenant';
import { userSchema } from './users';

export const passwordSchema = z.string().min(12).max(128);
export const tokenSchema = z.string().regex(/^[A-Za-z0-9_-]{43}$/, 'format.token');

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
		workspace: z.enum(workspaceKinds),
		expiresAt: instantSchema.nullable()
	}),
	mode: z.enum(appModes),
	leadsTeams: z.array(z.object({ id: uuidSchema, name: z.string() })),
	security: z.object({
		enrollmentPending: z.boolean(),
		reauthUntil: instantSchema.nullable()
	}),
	csrfToken: z.string()
});

export const mfaMethods = ['totp', 'recovery', 'passkey'] as const;
export type MfaMethod = (typeof mfaMethods)[number];

export const mfaChallengeSchema = z.object({
	mfaRequired: z.literal(true),
	methods: z.array(z.enum(mfaMethods)).min(1)
});

export const loginResultSchema = z.union([sessionSchema, mfaChallengeSchema]);

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
export type MfaChallenge = z.infer<typeof mfaChallengeSchema>;
export type LoginResult = z.infer<typeof loginResultSchema>;
export type ActiveSession = z.infer<typeof activeSessionSchema>;
