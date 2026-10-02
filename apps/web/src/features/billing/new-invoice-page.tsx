import { parseDate } from '@internationalized/date';
import { useMutation, useQuery } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import { invoicePeriodIssue, type Role } from '@zeit/shared';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '../../components/ui/button';
import { Notice } from '../../components/ui/notice';
import { Page, PageHead } from '../../components/ui/page-shell';
import { SelectField } from '../../components/ui/select-field';
import { issueText } from '../../i18n';
import { formatCents, formatDate, formatMinutes } from '../../i18n/format';
import { hasCode } from '../../lib/api/errors';
import { currentMonth, todayIso } from '../../lib/dates';
import { useErrorText } from '../hr/error-text';
import { DateInputField } from '../hr/ui/date-field';
import styles from '../hr/ui/page.module.css';
import { clientsQuery, createDraft, unbilledQuery } from './api';
import { BillingNav } from './billing-nav';
import { issueAt } from './fields';
import css from './new-invoice-page.module.css';

type Prefill = { client?: string | undefined; from?: string | undefined; to?: string | undefined };

type Props = {
	role: Role;
	prefill: Prefill;
};

const earliestFrom = (day: string, to: string) => {
	const limit = parseDate(to).subtract({ days: 365 }).toString();
	return day < limit ? limit : day;
};

export function NewInvoicePage({ role, prefill }: Props) {
	const { t, i18n } = useTranslation('billing');
	const navigate = useNavigate();
	const errorText = useErrorText();
	const [clientId, setClientId] = useState(prefill.client ?? '');
	const [from, setFrom] = useState(prefill.from ?? `${currentMonth()}-01`);
	const [to, setTo] = useState(prefill.to ?? todayIso());
	const [followOldest, setFollowOldest] = useState(
		prefill.client !== undefined && prefill.from === undefined
	);

	const clients = useQuery(clientsQuery);
	const unbilled = useQuery({
		...unbilledQuery({ client: clientId, to }),
		enabled: clientId !== ''
	});
	const preview = unbilled.data?.find((row) => row.clientId === clientId);
	const oldestFrom = preview && earliestFrom(preview.oldestDay, to);

	if (followOldest && unbilled.data) {
		setFollowOldest(false);
		if (oldestFrom && oldestFrom < from) setFrom(oldestFrom);
	}

	const changeFrom = (day: string) => {
		setFollowOldest(false);
		setFrom(day);
	};

	const draft = useMutation({
		mutationFn: () => createDraft({ clientId, from, to }),
		onSuccess: (invoice) =>
			void navigate({ to: '/billing/invoices/$id', params: { id: invoice.id } })
	});

	const period = invoicePeriodIssue({ from, to });
	const rangeProblem = period === null ? undefined : issueText(period);
	const refusal =
		draft.error &&
		(issueAt(draft.error, 'lines') ??
			issueAt(draft.error, 'entries') ??
			(hasCode(draft.error, 'INVALID_STATE')
				? t('newInvoice.nothingToBill')
				: errorText(draft.error)));
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

				<div className={`${styles.panel} ${css.panel}`}>
					<div className={css.fields}>
						<div className={css.client}>
							<SelectField
								label={t('newInvoice.client')}
								placeholder={t('newInvoice.chooseClient')}
								options={options}
								value={clientId || null}
								onChange={(key) => {
									setFollowOldest(false);
									setClientId(key === null ? '' : String(key));
								}}
							/>
						</div>
						<div className={css.range}>
							<DateInputField label={t('from')} value={from} onChange={changeFrom} />
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

					{preview && oldestFrom && preview.oldestDay < from && (
						<Notice
							action={
								oldestFrom < from && (
									<Button variant="quiet" onPress={() => changeFrom(oldestFrom)}>
										{t('newInvoice.fromOldest', {
											date: formatDate(oldestFrom, i18n.language, { year: undefined })
										})}
									</Button>
								)
							}
						>
							{t('newInvoice.olderOutside', {
								date: formatDate(preview.oldestDay, i18n.language, { year: undefined })
							})}
						</Notice>
					)}

					{refusal && <Notice tone="error">{refusal}</Notice>}
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
