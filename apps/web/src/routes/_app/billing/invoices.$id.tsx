import { createFileRoute } from '@tanstack/react-router';
import { requireRole } from '../../../app/require-role';
import { InvoicePage } from '../../../features/billing/invoice-page';
import { i18n } from '../../../i18n';

export const Route = createFileRoute('/_app/billing/invoices/$id')({
	beforeLoad: ({ context }) => requireRole(context.session, 'hr'),
	loader: () => i18n.loadNamespaces('billing'),
	staticData: { title: 'billing' },
	component: InvoiceRoute
});

function InvoiceRoute() {
	const { id } = Route.useParams();
	const { session } = Route.useRouteContext();
	return <InvoicePage key={id} id={id} role={session.user.role} />;
}
