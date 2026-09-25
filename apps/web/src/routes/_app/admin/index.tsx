import { createFileRoute } from '@tanstack/react-router';
import { requireRole } from '../../../app/require-role';
import { UsersPage } from '../../../features/admin/users/users-page';
import { i18n } from '../../../i18n';

export const Route = createFileRoute('/_app/admin/')({
	beforeLoad: ({ context }) => requireRole(context.session, 'admin'),
	// role and account changes ask for the password again in a dialog
	loader: () => i18n.loadNamespaces(['admin', 'security']),
	staticData: { title: 'admin' },
	component: AdminRoute
});

function AdminRoute() {
	const { session } = Route.useRouteContext();
	return <UsersPage selfId={session.user.id} />;
}
