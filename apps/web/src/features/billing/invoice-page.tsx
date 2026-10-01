import { useQuery } from '@tanstack/react-query';
import type { Role } from '@zeit/shared';
import { Page } from '../../components/ui/page-shell';
import { Loading, LoadError } from '../../components/ui/states';
import { invoiceQuery } from './api';
import { BillingNav } from './billing-nav';
import { InvoiceEditor } from './invoice-editor';
import { InvoiceView } from './invoice-view';

type Props = {
	id: string;
	role: Role;
};

export function InvoicePage({ id, role }: Props) {
	const invoice = useQuery(invoiceQuery(id));

	let body;
	if (invoice.isError) {
		body = <LoadError error={invoice.error} onRetry={() => void invoice.refetch()} />;
	} else if (!invoice.data) {
		body = <Loading rows={8} />;
	} else if (invoice.data.status === 'draft') {
		body = <InvoiceEditor invoice={invoice.data} role={role} previewKey={invoice.dataUpdatedAt} />;
	} else {
		body = <InvoiceView invoice={invoice.data} />;
	}

	return (
		<>
			<BillingNav role={role} />
			<Page>{body}</Page>
		</>
	);
}
