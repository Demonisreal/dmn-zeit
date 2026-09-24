import { createFileRoute } from '@tanstack/react-router';
import { requireRole } from '../../app/require-role';
import { InboxPage } from '../../features/inbox/inbox-page';

export const Route = createFileRoute('/_app/inbox')({
	beforeLoad: ({ context }) => requireRole(context.session, 'team_lead'),
	staticData: { title: 'inbox' },
	component: InboxRoute
});

function InboxRoute() {
	const { session } = Route.useRouteContext();
	return <InboxPage role={session.user.role} employeeId={session.user.employeeId} />;
}
