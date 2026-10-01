import { createFileRoute } from '@tanstack/react-router';
import { requireRole } from '../../../app/require-role';
import { SettingsPage } from '../../../features/billing/settings-page';
import { i18n } from '../../../i18n';

export const Route = createFileRoute('/_app/billing/settings')({
	beforeLoad: ({ context }) => requireRole(context.session, 'admin'),
	// changing the iban asks for the password again
	loader: () => i18n.loadNamespaces(['billing', 'security']),
	staticData: { title: 'billing' },
	component: SettingsRoute
});

function SettingsRoute() {
	const { session } = Route.useRouteContext();
	return <SettingsPage role={session.user.role} />;
}
