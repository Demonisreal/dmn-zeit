import { queryOptions } from '@tanstack/react-query';
import {
	absencePageSchema,
	clockSchema,
	correctionPageSchema,
	dayRangeSchema,
	flexAccountSchema,
	type CreateCorrectionInput
} from '@zeit/shared';
import { request } from '../../lib/api/client';

export const clockKey = ['clock'] as const;

export const clockQuery = queryOptions({
	queryKey: clockKey,
	queryFn: () => request('/clock', { schema: clockSchema })
});

export type ClockAction = 'in' | 'break' | 'resume' | 'out';

// the answer is not read, GET /clock afterwards decides what is shown
export const stamp = (action: ClockAction) => request(`/clock/${action}`, { method: 'POST' });

export const daysQuery = (employeeId: string, from: string, to: string) =>
	queryOptions({
		queryKey: ['days', employeeId, from, to],
		queryFn: () =>
			request(`/employees/${employeeId}/days?${new URLSearchParams({ from, to })}`, {
				schema: dayRangeSchema
			})
	});

export const flexQuery = (employeeId: string, year: number) =>
	queryOptions({
		queryKey: ['flex', employeeId, year],
		queryFn: () =>
			request(`/employees/${employeeId}/flex?year=${year}`, { schema: flexAccountSchema })
	});

export const openAbsencesQuery = (from: string, to: string) =>
	queryOptions({
		queryKey: ['absences', 'mine', 'open', from, to],
		queryFn: () =>
			request(
				`/absences?${new URLSearchParams({ scope: 'mine', status: 'pending,cancel_pending', from, to })}`,
				{ schema: absencePageSchema }
			)
	});

export const openCorrectionsQuery = (from: string, to: string) =>
	queryOptions({
		queryKey: ['corrections', 'mine', 'open', from, to],
		queryFn: () =>
			request(
				`/corrections?${new URLSearchParams({ scope: 'mine', status: 'pending', from, to })}`,
				{
					schema: correctionPageSchema
				}
			)
	});

export const createCorrection = (input: CreateCorrectionInput) =>
	request('/corrections', { method: 'POST', body: input });
