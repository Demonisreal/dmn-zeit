import { queryOptions } from '@tanstack/react-query';
import {
	billingProfileSchema,
	clientSchema,
	invoiceLineSchema,
	invoicePageSchema,
	invoiceSchema,
	projectSchema,
	rateSchema,
	revenueSchema,
	taskSchema,
	unbilledSchema,
	uuidSchema,
	type CancelInvoiceInput,
	type CreateClientInput,
	type CreateDraftInput,
	type CreateProjectInput,
	type CreateRateInput,
	type CreateTaskInput,
	type InvoiceLineInput,
	type InvoiceStatus,
	type IssueInvoiceInput,
	type MarkPaidInput,
	type UpdateBillingProfileInput,
	type UpdateClientInput,
	type UpdateDraftInput,
	type UpdateProjectInput,
	type UpdateTaskInput
} from '@zeit/shared';
import { z } from 'zod';
import { request } from '../../lib/api/client';
import { withSearch } from '../hr/api';

const memberSchema = z.object({ employeeId: uuidSchema, name: z.string() });

export type ProjectMember = z.infer<typeof memberSchema>;

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

export type InvoiceFilter = {
	status?: InvoiceStatus | undefined;
	client?: string | undefined;
	from?: string | undefined;
	to?: string | undefined;
};

export const invoicesQuery = (filter: InvoiceFilter, cursor?: string) =>
	queryOptions({
		queryKey: ['invoices', filter, cursor],
		queryFn: () =>
			request(withSearch('/invoices', { ...filter, cursor, limit: 50 }), {
				schema: invoicePageSchema
			})
	});

export const createDraft = (input: CreateDraftInput) =>
	request('/invoices/drafts', { method: 'POST', body: input, schema: invoiceSchema });

export const invoiceQuery = (id: string) =>
	queryOptions({
		queryKey: ['invoices', id],
		queryFn: () => request(`/invoices/${id}`, { schema: invoiceSchema })
	});

export const updateDraft = (id: string, input: UpdateDraftInput) =>
	request(`/invoices/${id}`, { method: 'PATCH', body: input, schema: invoiceSchema });

export const deleteInvoice = (id: string) => request(`/invoices/${id}`, { method: 'DELETE' });

export const refreshDraft = (id: string) =>
	request(`/invoices/${id}/refresh`, { method: 'POST', schema: invoiceSchema });

export const addLine = (id: string, input: InvoiceLineInput) =>
	request(`/invoices/${id}/lines`, { method: 'POST', body: input, schema: invoiceLineSchema });

export const updateLine = (id: string, lineId: string, input: Partial<InvoiceLineInput>) =>
	request(`/invoices/${id}/lines/${lineId}`, {
		method: 'PATCH',
		body: input,
		schema: invoiceLineSchema
	});

export const removeLine = (id: string, lineId: string) =>
	request(`/invoices/${id}/lines/${lineId}`, { method: 'DELETE' });

export const issueInvoice = (id: string, input: IssueInvoiceInput) =>
	request(`/invoices/${id}/issue`, { method: 'POST', body: input, schema: invoiceSchema });

export const cancelInvoice = (id: string, input: CancelInvoiceInput) =>
	request(`/invoices/${id}/cancel`, { method: 'POST', body: input, schema: invoiceSchema });

export const markPaid = (id: string, input: MarkPaidInput) =>
	request(`/invoices/${id}/paid`, { method: 'POST', body: input, schema: invoiceSchema });

export const markUnpaid = (id: string) =>
	request(`/invoices/${id}/unpaid`, { method: 'POST', schema: invoiceSchema });

export const billingProfileQuery = queryOptions({
	queryKey: ['billing-profile'],
	queryFn: () => request('/billing/profile', { schema: billingProfileSchema })
});

export const updateBillingProfile = (input: UpdateBillingProfileInput) =>
	request('/billing/profile', { method: 'PATCH', body: input, schema: billingProfileSchema });

export const unbilledQuery = (filter: { client?: string | undefined; to?: string | undefined }) =>
	queryOptions({
		queryKey: ['unbilled', filter],
		queryFn: () => request(withSearch('/billing/unbilled', filter), { schema: unbilledSchema })
	});

export const revenueQuery = (year: number) =>
	queryOptions({
		queryKey: ['revenue', year],
		queryFn: () => request(withSearch('/billing/revenue', { year }), { schema: revenueSchema })
	});

export const timeReportUrl = (filter: {
	client?: string | undefined;
	from: string;
	to: string;
	format: 'csv' | 'pdf';
}) => withSearch('/api/exports/time-report', filter);
