import { createFileRoute } from '@tanstack/react-router';
import { isoDateSchema, uuidSchema } from '@zeit/shared';
import { z } from 'zod';
import { requireRole, requireWorkspace } from '../../../app/require-role';
import { TeamProjectsPage } from '../../../features/projects/team-projects-page';

const searchSchema = z.object({
	week: isoDateSchema.optional().catch(undefined),
	team: uuidSchema.optional().catch(undefined),
	employee: uuidSchema.optional().catch(undefined)
});

export const Route = createFileRoute('/_app/team/projects')({
	validateSearch: searchSchema,
	beforeLoad: ({ context }) => {
		requireWorkspace(context.session, 'company');
		requireRole(context.session, 'team_lead');
	},
	staticData: { title: 'teamProjects' },
	component: TeamProjectsRoute
});

function TeamProjectsRoute() {
	const { session } = Route.useRouteContext();
	const search = Route.useSearch();
	const navigate = Route.useNavigate();
	return (
		<TeamProjectsPage
			session={session}
			week={search.week}
			team={search.team}
			employee={search.employee}
			onSearch={(next) =>
				void navigate({ search: (prev) => ({ ...prev, ...next }), replace: true })
			}
		/>
	);
}
