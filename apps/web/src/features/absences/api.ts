import {
	infiniteQueryOptions,
	queryOptions,
	skipToken,
	type QueryClient
} from '@tanstack/react-query';
import {
	absencePageSchema,
	absencePreviewSchema,
	type AbsenceStatus,
	type AbsenceType,
	type CreateAbsenceInput,
	type RequestScope
} from '@zeit/shared';
import { request } from '../../lib/api/client';
import { yearSpan } from './dates';

export type AbsenceFilter = {
	scope: RequestScope;
	from?: string | undefined;
	to?: string | undefined;
	status?: AbsenceStatus[] | undefined;
	type?: AbsenceType[] | undefined;
};

export type PreviewInput = Omit<CreateAbsenceInput, 'note'>;

function absencesPath(filter: AbsenceFilter, cursor: string | undefined) {
	const search = new URLSearchParams({ scope: filter.scope, limit: '100' });
	if (filter.from) search.set('from', filter.from);
	if (filter.to) search.set('to', filter.to);
	if (filter.status?.length) search.set('status', filter.status.join(','));
	if (filter.type?.length) search.set('type', filter.type.join(','));
	if (cursor) search.set('cursor', cursor);
	return `/absences?${search}`;
}

export const absencesQuery = (filter: AbsenceFilter) =>
	infiniteQueryOptions({
		queryKey: ['absences', 'list', filter],
		queryFn: ({ pageParam }) =>
			request(absencesPath(filter, pageParam), { schema: absencePageSchema }),
		initialPageParam: undefined as string | undefined,
		getNextPageParam: (page) => page.nextCursor ?? undefined
	});

export const ownAbsencesQuery = (year: number, type?: AbsenceType, status?: AbsenceStatus) =>
	absencesQuery({
		scope: 'mine',
		...yearSpan(year),
		type: type && [type],
		status: status && [status]
	});

export const previewQuery = (input: PreviewInput | null) =>
	queryOptions({
		queryKey: ['absences', 'preview', input],
		queryFn: input
			? () =>
					request('/absences/preview', {
						method: 'POST',
						body: input,
						schema: absencePreviewSchema
					})
			: skipToken
	});

export const createAbsence = (input: CreateAbsenceInput) =>
	request('/absences', { method: 'POST', body: input });

export const withdrawAbsence = (id: string) =>
	request(`/absences/${id}/withdraw`, { method: 'POST' });

export const cancelAbsence = (id: string, note: string | undefined) =>
	request(`/absences/${id}/cancel`, { method: 'POST', body: note ? { note } : {} });

export const refreshAbsences = (queryClient: QueryClient) =>
	Promise.all(
		[['absences'], ['vacation'], ['team-calendar']].map((queryKey) =>
			queryClient.invalidateQueries({ queryKey })
		)
	);
