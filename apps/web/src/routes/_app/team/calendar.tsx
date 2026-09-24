import { createFileRoute } from '@tanstack/react-router';
import { monthSchema, uuidSchema } from '@zeit/shared';
import { z } from 'zod';
import { todayIso } from '../../../features/absences/dates';
import { TeamCalendarPage } from '../../../features/team/team-calendar-page';

const searchSchema = z.object({
	month: monthSchema.optional().catch(undefined),
	team: uuidSchema.optional().catch(undefined)
});

// no role check: employees see their own team too, the api only tells them who is away, not why
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
