import { createFileRoute } from '@tanstack/react-router';
import { requireRole } from '../../../app/require-role';
import { ClientsPage } from '../../../features/billing/clients-page';
import { i18n } from '../../../i18n';

export const Route = createFileRoute('/_app/billing/clients/')({
	beforeLoad: ({ context }) => requireRole(context.session, 'hr'),
	loader: () => i18n.loadNamespaces(['billing', 'security']),
	staticData: { title: 'billing' },
	component: ClientsRoute
});

function ClientsRoute() {
	const { session } = Route.useRouteContext();
	return <ClientsPage role={session.user.role} solo={session.tenant.workspace === 'solo'} />;
}
