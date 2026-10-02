import { Link } from '@tanstack/react-router';
import type { ProjectWeek } from '@zeit/shared';
import { useId } from 'react';
import { useTranslation } from 'react-i18next';
import { formatCents, formatMinutes } from '../../i18n/format';
import { sumCents } from './matrix-rows';
import styles from './summary.module.css';

type Props = {
	unbilled: ProjectWeek['unbilled'];
};

export function Unbilled({ unbilled }: Props) {
	const { t, i18n } = useTranslation('projects');
	const titleId = useId();
	const lng = i18n.language;
	const total = sumCents(unbilled.map((client) => client.amountCents));

	return (
		<section className={styles.section} aria-labelledby={titleId}>
			<h2 id={titleId}>{t('unbilled.title')}</h2>
			{unbilled.length === 0 ? (
				<p className={styles.muted}>{t('unbilled.none')}</p>
			) : (
				<ul className={styles.list}>
					{unbilled.map((client) => (
						<li key={client.clientId}>
							<span className={styles.name}>
								<Link
									to="/billing/invoices/new"
									search={{ client: client.clientId }}
									aria-label={t('unbilled.invoice', { client: client.clientName })}
								>
									{client.clientName}
								</Link>
							</span>
							<span className={styles.figure}>{formatMinutes(client.minutes)}</span>
							{client.amountCents !== null && (
								<span className={styles.figure}>{formatCents(client.amountCents, lng)}</span>
							)}
						</li>
					))}
					{unbilled.length > 1 && (
						<li className={styles.total}>
							<span className={styles.name}>{t('unbilled.total')}</span>
							<span className={styles.figure}>
								{formatMinutes(unbilled.reduce((sum, client) => sum + client.minutes, 0))}
							</span>
							{total !== null && <span className={styles.figure}>{formatCents(total, lng)}</span>}
						</li>
					)}
				</ul>
			)}
			<p className={styles.muted}>{t('unbilled.hint')}</p>
		</section>
	);
}
