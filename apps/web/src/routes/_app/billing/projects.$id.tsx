import { createFileRoute } from '@tanstack/react-router';
import { requireRole } from '../../../app/require-role';
import { ProjectPage } from '../../../features/billing/project-page';
import { i18n } from '../../../i18n';

export const Route = createFileRoute('/_app/billing/projects/$id')({
	beforeLoad: ({ context }) => requireRole(context.session, 'hr'),
	loader: () => i18n.loadNamespaces('billing'),
	component: ProjectRoute
});

function ProjectRoute() {
	const { id } = Route.useParams();
	const { session } = Route.useRouteContext();
	return <ProjectPage key={id} id={id} solo={session.tenant.workspace === 'solo'} />;
}
