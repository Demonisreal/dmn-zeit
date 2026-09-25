import { createFileRoute, notFound } from '@tanstack/react-router';
import { monthSchema } from '@zeit/shared';
import { requireRole } from '../../../app/require-role';
import { MonthPage } from '../../../features/hr/months/month-page';
import { i18n } from '../../../i18n';

export const Route = createFileRoute('/_app/hr/months/$month')({
	beforeLoad: ({ context, params }) => {
		requireRole(context.session, 'hr');
		if (!monthSchema.safeParse(params.month).success) throw notFound();
	},
	// reopening a closed month asks for the password again in a dialog
	loader: () => i18n.loadNamespaces('security'),
	component: MonthRoute
});

function MonthRoute() {
	const { month } = Route.useParams();
	const { session } = Route.useRouteContext();
	return <MonthPage key={month} month={month} role={session.user.role} />;
}
