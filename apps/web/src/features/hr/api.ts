import { infiniteQueryOptions, queryOptions } from '@tanstack/react-query';
import {
	auditPageSchema,
	contractSchema,
	employeeSchema,
	findingSchema,
	flexAccountSchema,
	monthChecklistSchema,
	monthClosingSchema,
	monthOverviewSchema,
	ruleSetSchema,
	teamSchema,
	timesheetSchema,
	vacationNoticePageSchema,
	workModelSchema,
	type AckFindingInput,
	type CreateContractInput,
	type CreateEmployeeInput,
	type CreateFlexBookingInput,
	type CreateTeamInput,
	type CreateVacationNoticesInput,
	type CreateWorkModelInput,
	type FindingsQuery,
	type UpdateEmployeeInput,
	type UpdateTeamInput,
	type UpdateWorkModelInput
} from '@zeit/shared';
import { z } from 'zod';
import { request } from '../../lib/api/client';

type Params = Record<string, string | number | boolean | undefined>;

export function withSearch(path: string, params: Params) {
	const search = new URLSearchParams();
	for (const [key, value] of Object.entries(params)) {
		if (value !== undefined && value !== '') search.set(key, String(value));
	}
	const query = search.toString();
	return query ? `${path}?${query}` : path;
}

export const employeesQuery = (includeExited = false) =>
	queryOptions({
		queryKey: ['employees', { includeExited }],
		queryFn: () =>
			request(withSearch('/employees', { includeExited }), { schema: z.array(employeeSchema) })
	});

export const employeeQuery = (id: string) =>
	queryOptions({
		queryKey: ['employees', id],
		queryFn: () => request(`/employees/${id}`, { schema: employeeSchema })
	});

export const createEmployee = (input: CreateEmployeeInput) =>
	request('/employees', { method: 'POST', body: input, schema: employeeSchema });

export const updateEmployee = (id: string, input: UpdateEmployeeInput) =>
	request(`/employees/${id}`, { method: 'PATCH', body: input });

export const exitEmployee = (id: string, exitDate: string) =>
	request(`/employees/${id}/exit`, { method: 'POST', body: { exitDate } });

export const contractsQuery = (employeeId: string) =>
	queryOptions({
		queryKey: ['contracts', employeeId],
		queryFn: () =>
			request(`/employees/${employeeId}/contracts`, { schema: z.array(contractSchema) })
	});

export const createContract = (employeeId: string, input: CreateContractInput) =>
	request(`/employees/${employeeId}/contracts`, { method: 'POST', body: input });

export const deleteContract = (employeeId: string, contractId: string) =>
	request(`/employees/${employeeId}/contracts/${contractId}`, { method: 'DELETE' });

export const workModelsQuery = (includeArchived = false) =>
	queryOptions({
		queryKey: ['work-models', { includeArchived }],
		queryFn: () =>
			request(withSearch('/work-models', { includeArchived }), {
				schema: z.array(workModelSchema)
			})
	});

export const createWorkModel = (input: CreateWorkModelInput) =>
	request('/work-models', { method: 'POST', body: input });

export const updateWorkModel = (id: string, input: UpdateWorkModelInput) =>
	request(`/work-models/${id}`, { method: 'PATCH', body: input });

export const teamsQuery = queryOptions({
	queryKey: ['teams'],
	queryFn: () => request('/teams', { schema: z.array(teamSchema) })
});

export const createTeam = (input: CreateTeamInput) =>
	request('/teams', { method: 'POST', body: input });

export const updateTeam = (id: string, input: UpdateTeamInput) =>
	request(`/teams/${id}`, { method: 'PATCH', body: input });

export const setTeamLeads = (id: string, userIds: string[]) =>
	request(`/teams/${id}/leads`, { method: 'PUT', body: { userIds } });

export const noticesQuery = (year: number) =>
	infiniteQueryOptions({
		queryKey: ['vacation-notices', year],
		queryFn: ({ pageParam }) =>
			request(withSearch('/vacation/notices', { year, cursor: pageParam, limit: 200 }), {
				schema: vacationNoticePageSchema
			}),
		initialPageParam: undefined as string | undefined,
		getNextPageParam: (page) => page.nextCursor ?? undefined
	});

export const sendNotices = (input: CreateVacationNoticesInput) =>
	request('/vacation/notices', { method: 'POST', body: input });

export const flexQuery = (employeeId: string, year: number) =>
	queryOptions({
		queryKey: ['flex', employeeId, year],
		queryFn: () =>
			request(withSearch(`/employees/${employeeId}/flex`, { year }), {
				schema: flexAccountSchema
			})
	});

export const bookFlex = (employeeId: string, input: CreateFlexBookingInput) =>
	request(`/employees/${employeeId}/flex/bookings`, { method: 'POST', body: input });

export const findingsQuery = (query: FindingsQuery) =>
	queryOptions({
		queryKey: ['findings', query],
		queryFn: () =>
			request(withSearch('/compliance/findings', query), { schema: z.array(findingSchema) })
	});

export const ackFinding = (input: AckFindingInput) =>
	request('/compliance/findings/ack', { method: 'POST', body: input });

export const ruleVersionsQuery = queryOptions({
	queryKey: ['rule-versions'],
	queryFn: () => request('/compliance/rule-versions', { schema: z.array(ruleSetSchema) }),
	staleTime: Infinity
});

export const checklistQuery = (month: string) =>
	queryOptions({
		queryKey: ['months', month, 'checklist'],
		queryFn: () => request(`/months/${month}/checklist`, { schema: monthChecklistSchema })
	});

export const closeMonth = (month: string) =>
	request(`/months/${month}/close`, { method: 'POST', schema: monthClosingSchema });

export const reopenMonth = (month: string, reason: string) =>
	request(`/months/${month}/reopen`, { method: 'POST', body: { reason } });

export const monthOverviewQuery = (month: string) =>
	queryOptions({
		queryKey: ['month-overview', month],
		queryFn: () =>
			request(withSearch('/exports/month-overview', { month, format: 'json' }), {
				schema: monthOverviewSchema
			})
	});

export const timesheetQuery = (employee: string, month: string) =>
	queryOptions({
		queryKey: ['timesheet', employee, month],
		queryFn: () =>
			request(withSearch('/exports/timesheet', { employee, month, format: 'json' }), {
				schema: timesheetSchema
			})
	});

export type AuditFilter = {
	from: string;
	to: string;
	table?: string | undefined;
	employee?: string | undefined;
};

export const auditQuery = (filter: AuditFilter) =>
	infiniteQueryOptions({
		queryKey: ['audit', filter],
		queryFn: ({ pageParam }) =>
			request(withSearch('/audit', { ...filter, cursor: pageParam, limit: 50 }), {
				schema: auditPageSchema
			}),
		initialPageParam: undefined as string | undefined,
		getNextPageParam: (page) => page.nextCursor ?? undefined
	});
