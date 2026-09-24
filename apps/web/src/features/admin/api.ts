import { queryOptions } from '@tanstack/react-query';
import {
	holidaySchema,
	tenantSchema,
	userSchema,
	type CreateUserInput,
	type UpdateTenantInput,
	type UpdateUserInput
} from '@zeit/shared';
import { z } from 'zod';
import { request } from '../../lib/api/client';
import { withSearch } from '../hr/api';

export const usersQuery = queryOptions({
	queryKey: ['users'],
	queryFn: () => request('/users', { schema: z.array(userSchema) })
});

export const createUser = (input: CreateUserInput) =>
	request('/users', { method: 'POST', body: input, schema: userSchema });

// createUser already sends the first invitation, this one is only for a resend
export const inviteUser = (id: string) => request(`/users/${id}/invite`, { method: 'POST' });

export const updateUser = (id: string, input: UpdateUserInput) =>
	request(`/users/${id}`, { method: 'PATCH', body: input });

export const setUserDisabled = (id: string, disabled: boolean) =>
	request(`/users/${id}/${disabled ? 'disable' : 'enable'}`, { method: 'POST' });

export const resetUserMfa = (id: string) => request(`/users/${id}/mfa/reset`, { method: 'POST' });

export const tenantQuery = queryOptions({
	queryKey: ['tenant'],
	queryFn: () => request('/tenant', { schema: tenantSchema })
});

export const updateTenant = (input: UpdateTenantInput) =>
	request('/tenant', { method: 'PATCH', body: input, schema: tenantSchema });

export const holidaysQuery = (year: number) =>
	queryOptions({
		queryKey: ['holidays', year],
		queryFn: () => request(withSearch('/holidays', { year }), { schema: z.array(holidaySchema) })
	});
