import { parseDate } from '@internationalized/date';
import { infiniteQueryOptions } from '@tanstack/react-query';
import { correctionPageSchema } from '@zeit/shared';
import { request } from '../../lib/api/client';
import { todayIso } from '../absences/dates';

// the api wants a range of at most 366 days; requests are made ahead, corrections look back
export function inboxRange(kind: 'ahead' | 'back') {
	const today = parseDate(todayIso());
	const from = kind === 'ahead' ? today.subtract({ days: 60 }) : today.subtract({ days: 365 });
	return { from: from.toString(), to: from.add({ days: 365 }).toString() };
}

export const pendingCorrectionsQuery = () => {
	const { from, to } = inboxRange('back');
	return infiniteQueryOptions({
		queryKey: ['corrections', 'inbox', from],
		queryFn: ({ pageParam }) => {
			const search = new URLSearchParams({
				scope: 'inbox',
				status: 'pending',
				from,
				to,
				limit: '100'
			});
			if (pageParam) search.set('cursor', pageParam);
			return request(`/corrections?${search}`, { schema: correctionPageSchema });
		},
		initialPageParam: undefined as string | undefined,
		getNextPageParam: (page) => page.nextCursor ?? undefined
	});
};

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
