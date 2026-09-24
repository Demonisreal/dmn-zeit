import { createFileRoute, notFound, redirect } from '@tanstack/react-router';
import { monthSchema, type Session } from '@zeit/shared';
import { TimesheetSheet } from '../../features/hr/print/timesheet-sheet';
import { i18n } from '../../i18n';
import { sessionQuery } from '../../lib/api/auth';

const applied = new WeakSet<Session>();

// outside _app so the sheet prints without navigation, the session check is the same one
export const Route = createFileRoute('/print/timesheet/$id/$month')({
	beforeLoad: async ({ context, location, params }) => {
		const session = await context.queryClient.ensureQueryData(sessionQuery);
		if (!session) throw redirect({ to: '/login', search: { next: location.href } });
		if (session.security.enrollmentPending) throw redirect({ to: '/security/setup' });
		if (!applied.has(session)) {
			applied.add(session);
			await i18n.changeLanguage(session.user.locale);
		}
		if (!monthSchema.safeParse(params.month).success) throw notFound();
	},
	component: PrintRoute
});

function PrintRoute() {
	const { id, month } = Route.useParams();
	return <TimesheetSheet employeeId={id} month={month} />;
}
