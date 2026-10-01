import { createFileRoute } from '@tanstack/react-router';
import { requireRole } from '../../../app/require-role';
import { ClientPage } from '../../../features/billing/client-page';
import { i18n } from '../../../i18n';

export const Route = createFileRoute('/_app/billing/clients/$id')({
	beforeLoad: ({ context }) => requireRole(context.session, 'hr'),
	loader: () => i18n.loadNamespaces('billing'),
	component: ClientRoute
});

function ClientRoute() {
	const { id } = Route.useParams();
	const { session } = Route.useRouteContext();
	return (
		<ClientPage
			key={id}
			id={id}
			solo={session.tenant.workspace === 'solo'}
			role={session.user.role}
		/>
	);
}
