import { queryOptions, useMutation, useQueryClient } from '@tanstack/react-query';
import {
	bookableProjectSchema,
	pageOf,
	projectEntrySchema,
	projectSchema,
	projectSummarySchema,
	projectTimerSchema,
	projectWeekSchema,
	type CreateProjectEntryInput,
	type StartTimerInput,
	type UpdateProjectEntryInput
} from '@zeit/shared';
import { z } from 'zod';
import { request } from '../../lib/api/client';

export const timerKey = ['project-timer'] as const;

export const timerQuery = queryOptions({
	queryKey: timerKey,
	queryFn: () => request('/project-timer', { schema: projectTimerSchema })
});

// the list changes with the billing pages, not while someone books time
export const bookableQuery = queryOptions({
	queryKey: ['projects', 'bookable'],
	queryFn: () => request('/projects/bookable', { schema: z.array(bookableProjectSchema) }),
	staleTime: 5 * 60_000
});

export const budgetsQuery = queryOptions({
	queryKey: ['projects', 'budgets'],
	queryFn: () => request('/projects/budgets', { schema: z.array(projectSchema) })
});

export const projectWeekQuery = (employeeId: string, from: string) =>
	queryOptions({
		queryKey: ['project-week', employeeId, from],
		queryFn: () =>
			request(`/employees/${employeeId}/project-week?from=${from}`, { schema: projectWeekSchema })
	});

// a week of entries fits one page, the cursor only matters for longer ranges
export const projectEntriesQuery = (employeeId: string, from: string, to: string) =>
	queryOptions({
		queryKey: ['project-entries', employeeId, from, to],
		queryFn: () =>
			request(
				`/employees/${employeeId}/project-entries?${new URLSearchParams({ from, to, limit: '200' })}`,
				{ schema: pageOf(projectEntrySchema) }
			)
	});

export const summaryQuery = (team: string | undefined, from: string, to: string) =>
	queryOptions({
		queryKey: ['project-summary', team ?? null, from, to],
		queryFn: () =>
			request(
				`/project-time/summary?${new URLSearchParams(team ? { team, from, to } : { from, to })}`,
				{ schema: projectSummarySchema }
			)
	});

export const startTimer = (input: StartTimerInput) =>
	request('/project-timer/start', { method: 'POST', body: input });

export const stopTimer = () => request('/project-timer/stop', { method: 'POST' });

export const createEntry = (input: CreateProjectEntryInput) =>
	request('/project-entries', { method: 'POST', body: input });

export const updateEntry = ({ id, ...input }: UpdateProjectEntryInput & { id: string }) =>
	request(`/project-entries/${id}`, { method: 'PATCH', body: input });

export const voidEntry = (id: string) => request(`/project-entries/${id}/void`, { method: 'POST' });

// timer, matrix, budgets and the team view all read the same entries
export function useProjectMutation<T>(mutationFn: (input: T) => Promise<void>) {
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn,
		onSettled: () =>
			Promise.all(
				[
					timerKey,
					['project-week'],
					['project-entries'],
					['project-summary'],
					budgetsQuery.queryKey
				].map((queryKey) => queryClient.invalidateQueries({ queryKey }))
			)
	});
}
