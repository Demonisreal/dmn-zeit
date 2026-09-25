import { queryOptions } from '@tanstack/react-query';
import {
	clientSchema,
	projectSchema,
	rateSchema,
	taskSchema,
	uuidSchema,
	type CreateClientInput,
	type CreateProjectInput,
	type CreateRateInput,
	type CreateTaskInput,
	type UpdateClientInput,
	type UpdateProjectInput,
	type UpdateTaskInput
} from '@zeit/shared';
import { z } from 'zod';
import { request } from '../../lib/api/client';
import { withSearch } from '../hr/api';

const memberSchema = z.object({ employeeId: uuidSchema, name: z.string() });

export type ProjectMember = z.infer<typeof memberSchema>;

// archived ones come along, the list filters itself and can tell "none yet" from "all archived"
export const clientsQuery = queryOptions({
	queryKey: ['clients'],
	queryFn: () =>
		request(withSearch('/clients', { includeArchived: true }), { schema: z.array(clientSchema) })
});

export const clientQuery = (id: string) =>
	queryOptions({
		queryKey: ['clients', id],
		queryFn: () => request(`/clients/${id}`, { schema: clientSchema })
	});

export const createClient = (input: CreateClientInput) =>
	request('/clients', { method: 'POST', body: input, schema: clientSchema });

export const updateClient = (id: string, input: UpdateClientInput) =>
	request(`/clients/${id}`, { method: 'PATCH', body: input });

export const archiveClient = (id: string) => request(`/clients/${id}/archive`, { method: 'POST' });

export const removeClient = (id: string) => request(`/clients/${id}`, { method: 'DELETE' });

// the keys sit under ['projects'] with bookable and budgets, so the timer sees a new project right away
export const projectsQuery = (client?: string) =>
	queryOptions({
		queryKey: ['projects', { client: client ?? null }],
		queryFn: () =>
			request(withSearch('/projects', { client, includeArchived: true }), {
				schema: z.array(projectSchema)
			})
	});

export const projectQuery = (id: string) =>
	queryOptions({
		queryKey: ['projects', id],
		queryFn: () => request(`/projects/${id}`, { schema: projectSchema })
	});

export const createProject = (input: CreateProjectInput) =>
	request('/projects', { method: 'POST', body: input, schema: projectSchema });

export const updateProject = (id: string, input: UpdateProjectInput) =>
	request(`/projects/${id}`, { method: 'PATCH', body: input });

export const membersQuery = (projectId: string) =>
	queryOptions({
		queryKey: ['projects', projectId, 'members'],
		queryFn: () => request(`/projects/${projectId}/members`, { schema: z.array(memberSchema) })
	});

export const setMembers = (projectId: string, employeeIds: string[]) =>
	request(`/projects/${projectId}/members`, { method: 'PUT', body: { employeeIds } });

export const tasksQuery = (projectId: string) =>
	queryOptions({
		queryKey: ['projects', projectId, 'tasks'],
		queryFn: () => request(`/projects/${projectId}/tasks`, { schema: z.array(taskSchema) })
	});

export const createTask = (projectId: string, input: CreateTaskInput) =>
	request(`/projects/${projectId}/tasks`, { method: 'POST', body: input });

export const updateTask = (id: string, input: UpdateTaskInput) =>
	request(`/tasks/${id}`, { method: 'PATCH', body: input });

export const archiveTask = (id: string) => request(`/tasks/${id}/archive`, { method: 'POST' });

export type RateScope = { client?: string | undefined; project?: string | undefined };

export const ratesQuery = (scope: RateScope) =>
	queryOptions({
		queryKey: ['rates', scope],
		queryFn: () => request(withSearch('/rates', scope), { schema: z.array(rateSchema) })
	});

export const createRate = (input: CreateRateInput) =>
	request('/rates', { method: 'POST', body: input });

export const removeRate = (id: string) => request(`/rates/${id}`, { method: 'DELETE' });
