import { createFileRoute } from '@tanstack/react-router';
import { isoDateSchema, uuidSchema } from '@zeit/shared';
import { z } from 'zod';
import { requireRole } from '../../../app/require-role';
import { NewInvoicePage } from '../../../features/billing/new-invoice-page';
import { i18n } from '../../../i18n';

const searchSchema = z.object({
	client: uuidSchema.optional().catch(undefined),
	from: isoDateSchema.optional().catch(undefined),
	to: isoDateSchema.optional().catch(undefined)
});

export const Route = createFileRoute('/_app/billing/invoices/new')({
	validateSearch: searchSchema,
	beforeLoad: ({ context }) => requireRole(context.session, 'hr'),
	loader: () => i18n.loadNamespaces('billing'),
	staticData: { title: 'billing' },
	component: NewInvoiceRoute
});

function NewInvoiceRoute() {
	const search = Route.useSearch();
	const { session } = Route.useRouteContext();
	return <NewInvoicePage role={session.user.role} prefill={search} />;
}
