import { createFileRoute } from '@tanstack/react-router';
import { isoDateSchema } from '@zeit/shared';
import { z } from 'zod';
import { projectWeekQuery } from '../../features/projects/api';
import { ProjectWeekPage } from '../../features/projects/project-week-page';
import { daysQuery } from '../../features/week/api';
import { addDays, mondayOf } from '../../features/week/dates';
import { WeekPage } from '../../features/week/week-page';
import { todayIso } from '../../lib/dates';

const searchSchema = z.object({ week: isoDateSchema.optional().catch(undefined) });

export const Route = createFileRoute('/_app/')({
	validateSearch: searchSchema,
	loaderDeps: ({ search }) => ({ week: search.week }),
	loader: ({ context, deps, cause }) => {
		const { employeeId } = context.session.user;
		if (!employeeId) return;
		const monday = mondayOf(deps.week ?? todayIso());
		const week =
			context.session.tenant.workspace === 'solo'
				? context.queryClient.prefetchQuery(projectWeekQuery(employeeId, monday))
				: context.queryClient.prefetchQuery(daysQuery(employeeId, monday, addDays(monday, 6)));
		return cause === 'stay' ? undefined : week;
	},
	staticData: { title: 'week' },
	component: WeekRoute
});

function WeekRoute() {
	const { session } = Route.useRouteContext();
	const { week } = Route.useSearch();
	const navigate = Route.useNavigate();
	return session.tenant.workspace === 'solo' ? (
		<ProjectWeekPage
			session={session}
			week={week}
			onWeek={(next) => void navigate({ search: next ? { week: next } : {} })}
		/>
	) : (
		<WeekPage session={session} week={week} />
	);
}
