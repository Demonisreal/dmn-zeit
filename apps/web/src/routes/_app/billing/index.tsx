import { createFileRoute } from '@tanstack/react-router';
import { invoiceStatuses, isoDateSchema, uuidSchema } from '@zeit/shared';
import { z } from 'zod';
import { requireRole } from '../../../app/require-role';
import { InvoicesPage } from '../../../features/billing/invoices-page';
import { i18n } from '../../../i18n';

const searchSchema = z.object({
	status: z.enum(invoiceStatuses).optional().catch(undefined),
	client: uuidSchema.optional().catch(undefined),
	from: isoDateSchema.optional().catch(undefined),
	to: isoDateSchema.optional().catch(undefined)
});

export const Route = createFileRoute('/_app/billing/')({
	validateSearch: searchSchema,
	beforeLoad: ({ context }) => requireRole(context.session, 'hr'),
	loader: () => i18n.loadNamespaces('billing'),
	staticData: { title: 'billing' },
	component: InvoicesRoute
});

function InvoicesRoute() {
	const search = Route.useSearch();
	const navigate = Route.useNavigate();
	const { session } = Route.useRouteContext();
	return (
		<InvoicesPage
			role={session.user.role}
			filter={search}
			onFilter={(next) =>
				void navigate({ search: (prev) => ({ ...prev, ...next }), replace: true })
			}
		/>
	);
}
