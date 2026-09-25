import { parseDate } from '@internationalized/date';
import { infiniteQueryOptions } from '@tanstack/react-query';
import { correctionPageSchema } from '@zeit/shared';
import { request } from '../../lib/api/client';
import { todayIso } from '../absences/dates';

// only scope=inbox may go without a range, everything else needs one of at most 366 days
export function inboxRange() {
	const today = parseDate(todayIso());
	return { from: today.subtract({ days: 365 }).toString(), to: today.toString() };
}

export const pendingCorrectionsQuery = () =>
	infiniteQueryOptions({
		queryKey: ['corrections', 'inbox'],
		queryFn: ({ pageParam }) => {
			const search = new URLSearchParams({ scope: 'inbox', status: 'pending', limit: '100' });
			if (pageParam) search.set('cursor', pageParam);
			return request(`/corrections?${search}`, { schema: correctionPageSchema });
		},
		initialPageParam: undefined as string | undefined,
		getNextPageParam: (page) => page.nextCursor ?? undefined
	});

export const approveAbsence = (id: string) =>
	request(`/absences/${id}/approve`, { method: 'POST' });

export const rejectAbsence = (id: string, note: string) =>
	request(`/absences/${id}/reject`, { method: 'POST', body: { note } });

export const confirmSickNote = (id: string) =>
	request(`/absences/${id}/confirm-sick-note`, { method: 'POST' });

export const approveCorrection = (id: string) =>
	request(`/corrections/${id}/approve`, { method: 'POST' });

export const rejectCorrection = (id: string, note: string) =>
	request(`/corrections/${id}/reject`, { method: 'POST', body: { note } });
