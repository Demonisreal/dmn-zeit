import { createFileRoute } from '@tanstack/react-router';
import { requireRole } from '../../app/require-role';
import { pendingAbsencesQuery, pendingCorrectionsQuery } from '../../features/inbox/api';
import { InboxPage } from '../../features/inbox/inbox-page';

export const Route = createFileRoute('/_app/inbox')({
	beforeLoad: ({ context }) => requireRole(context.session, 'team_lead'),
	loader: ({ context }) =>
		Promise.all([
			context.queryClient.prefetchInfiniteQuery(pendingAbsencesQuery()),
			context.queryClient.prefetchInfiniteQuery(pendingCorrectionsQuery())
		]),
	staticData: { title: 'inbox' },
	component: InboxRoute
});

function InboxRoute() {
	const { session } = Route.useRouteContext();
	return <InboxPage role={session.user.role} employeeId={session.user.employeeId} />;
}
