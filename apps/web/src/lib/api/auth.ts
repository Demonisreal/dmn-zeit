import { queryOptions } from '@tanstack/react-query';
import {
	invitationSchema,
	sessionSchema,
	userSchema,
	type AcceptInvitationInput,
	type ForgotPasswordInput,
	type Locale,
	type LoginInput,
	type ResetPasswordInput
} from '@zeit/shared';
import { request } from './client';
import { ApiRequestError } from './errors';
import { sessionKey } from './query-client';

export const sessionQuery = queryOptions({
	queryKey: sessionKey,
	queryFn: async () => {
		try {
			return await request('/auth/session', { schema: sessionSchema });
		} catch (err) {
			// 401 is the normal answer for a visitor, not a failure
			if (err instanceof ApiRequestError && err.status === 401) return null;
			throw err;
		}
	},
	staleTime: 5 * 60_000
});

export const login = (input: LoginInput) =>
	request('/auth/login', { method: 'POST', body: input, schema: sessionSchema });

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
	request('/auth/invitations/accept', { method: 'POST', body: input });

export const saveLocale = (locale: Locale) =>
	request('/me', { method: 'PATCH', body: { locale }, schema: userSchema });
