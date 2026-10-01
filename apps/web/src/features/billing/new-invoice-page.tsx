import { useMutation, useQuery } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import type { Role } from '@zeit/shared';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '../../components/ui/button';
import { Notice } from '../../components/ui/notice';
import { Page, PageHead } from '../../components/ui/page-shell';
import { SelectField } from '../../components/ui/select-field';
import { formatCents, formatDate, formatMinutes } from '../../i18n/format';
import { useErrorText } from '../hr/error-text';
import { DateInputField } from '../hr/ui/date-field';
import styles from '../hr/ui/page.module.css';
import { clientsQuery, createDraft, unbilledQuery } from './api';
import { BillingNav } from './billing-nav';

type Prefill = { client?: string | undefined; from?: string | undefined; to?: string | undefined };

type Props = {
	role: Role;
	prefill: Prefill;
};

// the same first-of-month-to-today span the project week already suggests for "not yet billed"
const defaultFrom = () => `${new Date().toISOString().slice(0, 7)}-01`;
const defaultTo = () => new Date().toISOString().slice(0, 10);

export function NewInvoicePage({ role, prefill }: Props) {
	const { t, i18n } = useTranslation('billing');
	const navigate = useNavigate();
	const errorText = useErrorText();
	const [clientId, setClientId] = useState(prefill.client ?? '');
	const [from, setFrom] = useState(prefill.from ?? defaultFrom());
	const [to, setTo] = useState(prefill.to ?? defaultTo());

	const clients = useQuery(clientsQuery);
	const unbilled = useQuery({ ...unbilledQuery({ client: clientId, to }), enabled: clientId !== '' });
	const preview = unbilled.data?.find((row) => row.clientId === clientId);

	const draft = useMutation({
		mutationFn: () => createDraft({ clientId, from, to }),
		onSuccess: (invoice) =>
			void navigate({ to: '/billing/invoices/$id', params: { id: invoice.id } })
	});

	const rangeProblem = from > to ? t('newInvoice.rangeUnordered') : undefined;
	const options = (clients.data ?? [])
		.filter((client) => !client.archivedAt)
		.map((client) => ({ id: client.id, label: client.name }));

	return (
		<>
			<BillingNav role={role} />
			<Page>
				<PageHead>
					<div>
						<h1>{t('newInvoice.title')}</h1>
						<p className={styles.lead}>{t('newInvoice.lead')}</p>
					</div>
				</PageHead>

				<div className={styles.panel}>
					<div className={styles.fields}>
						<div className={styles.wide}>
							<SelectField
								label={t('newInvoice.client')}
								placeholder={t('newInvoice.chooseClient')}
								options={options}
								value={clientId || null}
								onChange={(key) => setClientId(key === null ? '' : String(key))}
							/>
						</div>
						<div className={styles.range}>
							<DateInputField label={t('from')} value={from} onChange={setFrom} />
							<DateInputField label={t('to')} value={to} onChange={setTo} error={rangeProblem} />
						</div>
					</div>

					{clientId !== '' &&
						(unbilled.isError ? (
							<Notice tone="error">{errorText(unbilled.error)}</Notice>
						) : !unbilled.data ? (
							<p className={`${styles.small} ${styles.muted}`}>{t('newInvoice.loadingPreview')}</p>
						) : !preview ? (
							<p className={`${styles.small} ${styles.muted}`}>{t('newInvoice.nothingUnbilled')}</p>
						) : (
							<dl className={styles.facts}>
								<dt>{t('newInvoice.minutes')}</dt>
								<dd className={styles.mono}>{formatMinutes(preview.minutes)}</dd>
								<dt>{t('newInvoice.amount')}</dt>
								<dd className={styles.mono}>
									{preview.amountCents === null
										? t('newInvoice.noRate')
										: formatCents(preview.amountCents, i18n.language)}
								</dd>
								<dt>{t('newInvoice.oldestDay')}</dt>
								<dd className={styles.mono}>{formatDate(preview.oldestDay, i18n.language)}</dd>
							</dl>
						))}

					{draft.error && <Notice tone="error">{errorText(draft.error)}</Notice>}
					<div className={styles.actions}>
						<Button
							variant="primary"
							isPending={draft.isPending}
							isDisabled={clientId === '' || rangeProblem !== undefined}
							onPress={() => draft.mutate()}
						>
							{t('newInvoice.create')}
						</Button>
					</div>
				</div>
			</Page>
		</>
	);
}
