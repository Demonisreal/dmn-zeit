import { createFileRoute } from '@tanstack/react-router';
import { monthSchema, uuidSchema } from '@zeit/shared';
import { z } from 'zod';
import { TeamCalendarPage } from '../../../features/team/team-calendar-page';
import { todayIso } from '../../../lib/dates';

const searchSchema = z.object({
	month: monthSchema.optional().catch(undefined),
	team: uuidSchema.optional().catch(undefined)
});

export const Route = createFileRoute('/_app/team/calendar')({
	validateSearch: searchSchema,
	staticData: { title: 'teamCalendar' },
	component: TeamCalendarRoute
});

function TeamCalendarRoute() {
	const { session } = Route.useRouteContext();
	const search = Route.useSearch();
	const navigate = Route.useNavigate();
	return (
		<TeamCalendarPage
			session={session}
			month={search.month ?? todayIso().slice(0, 7)}
			team={search.team}
			onSearch={(next) =>
				void navigate({ search: (prev) => ({ ...prev, ...next }), replace: true })
			}
		/>
	);
}
