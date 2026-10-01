import { createFileRoute } from '@tanstack/react-router';
import { isoDateSchema } from '@zeit/shared';
import { z } from 'zod';
import { requireWorkspace } from '../../app/require-role';
import { projectWeekQuery } from '../../features/projects/api';
import { ProjectWeekPage } from '../../features/projects/project-week-page';
import { mondayOf } from '../../features/week/dates';
import { todayIso } from '../../lib/dates';

const searchSchema = z.object({ week: isoDateSchema.optional().catch(undefined) });

export const Route = createFileRoute('/_app/projects')({
	validateSearch: searchSchema,
	beforeLoad: ({ context }) => requireWorkspace(context.session, 'company'),
	loaderDeps: ({ search }) => ({ week: search.week }),
	loader: ({ context, deps, cause }) => {
		const { employeeId } = context.session.user;
		if (!employeeId) return;
		const week = context.queryClient.prefetchQuery(
			projectWeekQuery(employeeId, mondayOf(deps.week ?? todayIso()))
		);
		return cause === 'stay' ? undefined : week;
	},
	staticData: { title: 'projects' },
	component: ProjectsRoute
});

function ProjectsRoute() {
	const { session } = Route.useRouteContext();
	const { week } = Route.useSearch();
	const navigate = Route.useNavigate();
	return (
		<ProjectWeekPage
			session={session}
			week={week}
			onWeek={(next) => void navigate({ search: next ? { week: next } : {} })}
		/>
	);
}
