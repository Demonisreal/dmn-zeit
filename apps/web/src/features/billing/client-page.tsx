import { useQuery } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import type { Client } from '@zeit/shared';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '../../components/ui/button';
import { Notice } from '../../components/ui/notice';
import { Page, PageHead } from '../../components/ui/page-shell';
import { Loading, LoadError } from '../../components/ui/states';
import { Tag } from '../../components/ui/tag';
import styles from '../hr/ui/page.module.css';
import { clientQuery } from './api';
import { BillingNav } from './billing-nav';
import { ClientForm } from './client-form';
import css from './client-page.module.css';
import { ClientProjects } from './client-projects';
import { RatesTable } from './rates-table';
import { useRoundingText } from './use-rounding-text';

type Props = {
	id: string;
	solo: boolean;
};

export function ClientPage({ id, solo }: Props) {
	const { t } = useTranslation('billing');
	const [editing, setEditing] = useState(false);
	const [closed, setClosed] = useState(false);
	const client = useQuery(clientQuery(id));

	let body;
	if (client.isError) {
		body = <LoadError error={client.error} onRetry={() => void client.refetch()} />;
	} else if (!client.data) {
		body = <Loading rows={6} />;
	} else {
		const current = client.data;
		body = (
			<>
				<PageHead>
					<div>
						<h1 className={css.title}>
							{current.name}{' '}
							{current.restrictedAt ? (
								<Tag>{t('restricted')}</Tag>
							) : (
								current.archivedAt && <Tag>{t('archived')}</Tag>
							)}
						</h1>
						{current.number && (
							<p className={styles.lead}>{t('client.lead', { number: current.number })}</p>
						)}
					</div>
					{!editing && !current.restrictedAt && (
						<Button variant="secondary" autoFocus={closed} onPress={() => setEditing(true)}>
							{t('client.edit')}
						</Button>
					)}
				</PageHead>

				{current.restrictedAt && <Notice>{t('client.restrictedText')}</Notice>}

				{editing ? (
					<ClientForm
						client={current}
						onDone={() => {
							setEditing(false);
							setClosed(true);
						}}
					/>
				) : (
					<ClientFacts client={current} />
				)}

				<ClientProjects client={current} />
				<RatesTable scope={{ kind: 'client', clientId: current.id }} solo={solo} />
			</>
		);
	}

	return (
		<>
			<BillingNav />
			<Page>
				<p className={styles.small}>
					<Link to="/billing/clients">{t('client.back')}</Link>
				</p>
				{body}
			</Page>
		</>
	);
}

function ClientFacts({ client }: { client: Client }) {
	const { t } = useTranslation('billing');
	const roundingText = useRoundingText(t('inheritGeneral'));
	const address = [
		client.street,
		[client.postalCode, client.city].filter(Boolean).join(' '),
		client.countryCode
	]
		.filter(Boolean)
		.join('\n');

	return (
		<dl className={styles.facts}>
			<dt>{t('client.address')}</dt>
			<dd className={css.address}>{address}</dd>
			<dt>{t('client.kind')}</dt>
			<dd>{client.isBusiness ? t('client.business') : t('client.private')}</dd>
			<dt>{t('client.vatId')}</dt>
			<dd className={styles.mono}>{client.vatId ?? '–'}</dd>
			<dt>{t('client.email')}</dt>
			<dd>{client.email ?? '–'}</dd>
			<dt>{t('client.invoiceLocale')}</dt>
			<dd>{t(`client.locales.${client.invoiceLocale}`)}</dd>
			<dt>{t('client.paymentTerms')}</dt>
			<dd>
				{client.paymentTermsDays === null
					? t('inheritGeneral')
					: t('client.paymentDays', { count: client.paymentTermsDays })}
			</dd>
			<dt>{t('rounding.title')}</dt>
			<dd>{roundingText(client)}</dd>
		</dl>
	);
}
