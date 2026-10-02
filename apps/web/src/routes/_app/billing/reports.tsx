import { createFileRoute } from '@tanstack/react-router';
import { isoDateSchema, uuidSchema } from '@zeit/shared';
import { z } from 'zod';
import { requireRole } from '../../../app/require-role';
import { ReportsPage } from '../../../features/billing/reports-page';
import { i18n } from '../../../i18n';
import { todayIso } from '../../../lib/dates';

const searchSchema = z.object({
	client: uuidSchema.optional().catch(undefined),
	from: isoDateSchema.optional().catch(undefined),
	to: isoDateSchema.optional().catch(undefined)
});

export const Route = createFileRoute('/_app/billing/reports')({
	validateSearch: searchSchema,
	beforeLoad: ({ context }) => requireRole(context.session, 'hr'),
	loader: () => i18n.loadNamespaces('billing'),
	staticData: { title: 'billing' },
	component: ReportsRoute
});

function ReportsRoute() {
	const search = Route.useSearch();
	const navigate = Route.useNavigate();
	const { session } = Route.useRouteContext();
	return (
		<ReportsPage
			role={session.user.role}
			filter={{
				client: search.client,
				from: search.from ?? `${todayIso().slice(0, 7)}-01`,
				to: search.to ?? todayIso()
			}}
			onFilter={(next) =>
				void navigate({ search: (prev) => ({ ...prev, ...next }), replace: true })
			}
		/>
	);
}
