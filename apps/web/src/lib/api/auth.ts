import { queryOptions } from '@tanstack/react-query';
import {
	activeSessionSchema,
	invitationSchema,
	loginResultSchema,
	passkeyCreatedSchema,
	passkeyCreationOptionsSchema,
	passkeyRequestOptionsSchema,
	reauthResultSchema,
	recoveryCodesSchema,
	securityOverviewSchema,
	sessionSchema,
	totpSetupSchema,
	userSchema,
	type AcceptInvitationInput,
	type CreatePasskeyInput,
	type ForgotPasswordInput,
	type Locale,
	type LoginInput,
	type MfaRecoveryInput,
	type MfaTotpInput,
	type PasskeyAssertionInput,
	type ReauthInput,
	type RenamePasskeyInput,
	type ResetPasswordInput
} from '@zeit/shared';
import { z } from 'zod';
import { request } from './client';
import { ApiRequestError } from './errors';
import { sessionKey } from './query-client';

export const sessionQuery = queryOptions({
	queryKey: sessionKey,
	queryFn: async () => {
		try {
			return await request('/auth/session', { schema: sessionSchema });
		} catch (err) {
			if (err instanceof ApiRequestError && err.status === 401) return null;
			throw err;
		}
	},
	staleTime: 5 * 60_000
});

export const login = (input: LoginInput) =>
	request('/auth/login', { method: 'POST', body: input, schema: loginResultSchema });

export const logout = () => request('/auth/logout', { method: 'POST' });

export const forgotPassword = (input: ForgotPasswordInput) =>
	request('/auth/password/forgot', { method: 'POST', body: input });

export const resetPassword = (input: ResetPasswordInput) =>
	request('/auth/password/reset', { method: 'POST', body: input });

export const inspectInvitation = (token: string) =>
	request('/auth/invitations/inspect', {
		method: 'POST',
		body: { token },
		schema: invitationSchema
	});

export const acceptInvitation = (input: AcceptInvitationInput) =>
	request('/auth/invitations/accept', {
		method: 'POST',
		body: input,
		schema: sessionSchema
	});

export const saveLocale = (locale: Locale) =>
	request('/me', { method: 'PATCH', body: { locale }, schema: userSchema });

export const passkeyLoginOptions = () =>
	request('/auth/passkey/options', { method: 'POST', schema: passkeyRequestOptionsSchema });

export const passkeyLogin = (input: PasskeyAssertionInput) =>
	request('/auth/passkey/verify', { method: 'POST', body: input, schema: sessionSchema });

export const verifyTotp = (input: MfaTotpInput) =>
	request('/auth/mfa/totp', { method: 'POST', body: input, schema: sessionSchema });

export const verifyRecoveryCode = (input: MfaRecoveryInput) =>
	request('/auth/mfa/recovery', { method: 'POST', body: input, schema: sessionSchema });

export const mfaPasskeyOptions = () =>
	request('/auth/mfa/passkey/options', { method: 'POST', schema: passkeyRequestOptionsSchema });

export const verifyMfaPasskey = (input: PasskeyAssertionInput) =>
	request('/auth/mfa/passkey', { method: 'POST', body: input, schema: sessionSchema });

export const reauth = (input: ReauthInput) =>
	request('/auth/reauth', { method: 'POST', body: input, schema: reauthResultSchema });

export const reauthPasskeyOptions = () =>
	request('/auth/reauth/passkey/options', { method: 'POST', schema: passkeyRequestOptionsSchema });

export const reauthWithPasskey = (input: PasskeyAssertionInput) =>
	request('/auth/reauth/passkey', { method: 'POST', body: input, schema: reauthResultSchema });

export const activeSessionsQuery = queryOptions({
	queryKey: ['sessions'],
	queryFn: () => request('/auth/sessions', { schema: z.array(activeSessionSchema) })
});

export const endSession = (id: string) => request(`/auth/sessions/${id}`, { method: 'DELETE' });

export const securityQuery = queryOptions({
	queryKey: ['security'],
	queryFn: () => request('/security', { schema: securityOverviewSchema })
});

export const startTotpSetup = () =>
	request('/security/totp/setup', { method: 'POST', schema: totpSetupSchema });

export const confirmTotp = (input: MfaTotpInput) =>
	request('/security/totp/confirm', { method: 'POST', body: input, schema: recoveryCodesSchema });

export const removeTotp = () => request('/security/totp', { method: 'DELETE' });

export const passkeyCreationOptions = () =>
	request('/security/passkeys/options', { method: 'POST', schema: passkeyCreationOptionsSchema });

export const createPasskey = (input: CreatePasskeyInput) =>
	request('/security/passkeys', { method: 'POST', body: input, schema: passkeyCreatedSchema });

export const renamePasskey = (id: string, input: RenamePasskeyInput) =>
	request(`/security/passkeys/${id}`, { method: 'PATCH', body: input });

export const removePasskey = (id: string) =>
	request(`/security/passkeys/${id}`, { method: 'DELETE' });

export const renewRecoveryCodes = () =>
	request('/security/recovery-codes', { method: 'POST', schema: recoveryCodesSchema });
