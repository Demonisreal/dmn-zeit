import { queryOptions } from '@tanstack/react-query';
import { teamCalendarSchema } from '@zeit/shared';
import { request } from '../../lib/api/client';

export const teamCalendarQuery = (month: string, team: string | undefined) =>
	queryOptions({
		queryKey: ['team-calendar', month, team ?? null],
		queryFn: () =>
			request(`/team-calendar?${new URLSearchParams(team ? { month, team } : { month })}`, {
				schema: teamCalendarSchema
			})
	});
