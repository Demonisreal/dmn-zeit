import { useQuery } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import { invoiceStatuses, type InvoiceStatus, type Role } from '@zeit/shared';
import { VisuallyHidden } from 'react-aria-components';
import { useTranslation } from 'react-i18next';
import { EmptyState } from '../../components/ui/empty-state';
import { Page, PageHead } from '../../components/ui/page-shell';
import { SelectField } from '../../components/ui/select-field';
import { Loading, LoadError } from '../../components/ui/states';
import { Table } from '../../components/ui/table';
import { Tag } from '../../components/ui/tag';
import { formatCents, formatDate } from '../../i18n/format';
import { DateInputField } from '../hr/ui/date-field';
import styles from '../hr/ui/page.module.css';
import { clientsQuery, invoicesQuery, type InvoiceFilter } from './api';
import { BillingNav } from './billing-nav';
import css from './invoices-page.module.css';

const all = 'all';

const tones = { draft: 'pending', issued: 'neutral', paid: 'success', cancelled: 'neutral' } as const;

type Props = {
	role: Role;
	filter: InvoiceFilter;
	onFilter: (next: Partial<InvoiceFilter>) => void;
};

export function InvoicesPage({ role, filter, onFilter }: Props) {
	const { t, i18n } = useTranslation('billing');
	const invoices = useQuery(invoicesQuery(filter));
	const clients = useQuery(clientsQuery);
	const items = invoices.data?.items ?? [];
	const hasFilter = Boolean(filter.status || filter.client || filter.from || filter.to);
	const firstRun = invoices.data && items.length === 0 && !hasFilter;

	let body;
	if (invoices.isError) {
		body = <LoadError error={invoices.error} onRetry={() => void invoices.refetch()} />;
	} else if (!invoices.data) {
		body = <Loading rows={6} />;
	} else if (items.length === 0) {
		body = (
			<EmptyState
				title={t(hasFilter ? 'invoicesList.noMatch' : 'invoicesList.empty.title')}
				action={
					!hasFilter && (
						<Link to="/billing/invoices/new" className={css.newButton}>
							{t('invoicesList.new')}
						</Link>
					)
				}
			>
				{!hasFilter && t('invoicesList.empty.text')}
			</EmptyState>
		);
	} else {
		body = (
			<div className={styles.scroll} tabIndex={0}>
				<Table label={t('invoicesList.title')}>
					<thead>
						<tr>
							<th scope="col">{t('invoicesList.number')}</th>
							<th scope="col">{t('invoicesList.client')}</th>
							<th scope="col" data-priority="mid">
								{t('invoicesList.issueDate')}
							</th>
							<th scope="col" data-priority="mid">
								{t('invoicesList.dueDate')}
							</th>
							<th scope="col" data-numeric>
								{t('invoicesList.amount')}
							</th>
							<th scope="col">{t('invoicesList.status')}</th>
							<th scope="col" data-priority="mid">
								<VisuallyHidden>{t('actions')}</VisuallyHidden>
							</th>
						</tr>
					</thead>
					<tbody>
						{items.map((invoice) => (
							<tr key={invoice.id}>
								<td className={styles.mono}>
									<Link to="/billing/invoices/$id" params={{ id: invoice.id }}>
										{invoice.number ?? t('invoicesList.draftNumber')}
									</Link>
								</td>
								<td>{invoice.clientName}</td>
								<td className={styles.mono} data-priority="mid">
									{invoice.issueDate ? formatDate(invoice.issueDate, i18n.language) : '–'}
								</td>
								<td data-priority="mid">
									<span className={css.due}>
										<span className={styles.mono}>
											{invoice.dueDate ? formatDate(invoice.dueDate, i18n.language) : '–'}
										</span>
										{invoice.overdue && <Tag tone="warning">{t('invoicesList.overdue')}</Tag>}
									</span>
								</td>
								<td className={styles.mono} data-numeric>
									{formatCents(invoice.grossCents, i18n.language)}
								</td>
								<td>
									<Tag tone={tones[invoice.status]}>{t(`invoicesList.statuses.${invoice.status}`)}</Tag>
								</td>
								<td className={css.documents} data-priority="mid">
									{invoice.number && (
										<a
											href={`/api/invoices/${invoice.id}/document`}
											download
											aria-label={t('invoicesList.pdfLabel', { number: invoice.number })}
										>
											{t('invoicesList.pdf')}
										</a>
									)}
									{invoice.number && invoice.format === 'xrechnung' && (
										<a
											href={`/api/invoices/${invoice.id}/xml`}
											download
											aria-label={t('invoicesList.xmlLabel', { number: invoice.number })}
										>
											{t('invoicesList.xml')}
										</a>
									)}
								</td>
							</tr>
						))}
					</tbody>
				</Table>
			</div>
		);
	}

	return (
		<>
			<BillingNav role={role} />
			<Page>
				<PageHead>
					<div>
						<h1>{t('invoicesList.title')}</h1>
						<p className={styles.lead}>{t('invoicesList.lead')}</p>
					</div>
					{!firstRun && (
						<Link to="/billing/invoices/new" className={css.newButton}>
							{t('invoicesList.new')}
						</Link>
					)}
				</PageHead>

				<section className={styles.section} aria-label={t('invoicesList.title')}>
					<div className={styles.filters}>
						<SelectField
							label={t('invoicesList.statusFilter')}
							options={[
								{ id: all, label: t('invoicesList.allStatuses') },
								...invoiceStatuses.map((status) => ({
									id: status,
									label: t(`invoicesList.statuses.${status}`)
								}))
							]}
							value={filter.status ?? all}
							onChange={(key) =>
								onFilter({ status: key === all ? undefined : (key as InvoiceStatus) })
							}
						/>
						<SelectField
							label={t('invoicesList.clientFilter')}
							options={[
								{ id: all, label: t('invoicesList.allClients') },
								...(clients.data ?? []).map((client) => ({ id: client.id, label: client.name }))
							]}
							value={filter.client ?? all}
							onChange={(key) => onFilter({ client: key === all ? undefined : String(key) })}
						/>
						<div className={styles.range}>
							<DateInputField
								label={t('from')}
								value={filter.from ?? ''}
								onChange={(from) => onFilter({ from: from || undefined })}
							/>
							<DateInputField
								label={t('to')}
								value={filter.to ?? ''}
								onChange={(to) => onFilter({ to: to || undefined })}
							/>
						</div>
					</div>
					{body}
				</section>
			</Page>
		</>
	);
}
