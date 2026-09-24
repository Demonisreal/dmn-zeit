import { createFileRoute, notFound } from '@tanstack/react-router';
import { monthSchema } from '@zeit/shared';
import { requireRole } from '../../../app/require-role';
import { MonthPage } from '../../../features/hr/months/month-page';

export const Route = createFileRoute('/_app/hr/months/$month')({
	beforeLoad: ({ context, params }) => {
		requireRole(context.session, 'hr');
		if (!monthSchema.safeParse(params.month).success) throw notFound();
	},
	component: MonthRoute
});

function MonthRoute() {
	const { month } = Route.useParams();
	const { session } = Route.useRouteContext();
	return <MonthPage key={month} month={month} role={session.user.role} />;
}
