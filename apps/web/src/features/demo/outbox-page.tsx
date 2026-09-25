import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { EmptyState } from '../../components/ui/empty-state';
import { Loading, LoadError } from '../../components/ui/states';
import { formatInstant } from '../../i18n/format';
import { outboxQuery } from '../../lib/api/demo';
import styles from './demo.module.css';

export function OutboxPage() {
	const { t, i18n } = useTranslation('demo');
	const mails = useQuery(outboxQuery);

	let body;
	if (mails.isPending) {
		body = <Loading rows={3} />;
	} else if (mails.isError) {
		body = <LoadError error={mails.error} onRetry={() => void mails.refetch()} />;
	} else if (mails.data.length === 0) {
		body = <EmptyState title={t('outbox.empty')}>{t('outbox.emptyText')}</EmptyState>;
	} else {
		body = (
			<ol className={styles.mails} aria-label={t('outbox.list')}>
				{mails.data.map((mail) => (
					<li key={mail.id} className={styles.mail}>
						<h2 className={styles.subject}>{mail.subject}</h2>
						<time className={styles.stamp} dateTime={mail.createdAt}>
							{formatInstant(mail.createdAt, i18n.language)}
						</time>
						<p className={styles.to}>
							{t('outbox.to')} {mail.to}
						</p>
						<p className={styles.text}>{mail.text}</p>
					</li>
				))}
			</ol>
		);
	}

	return (
		<div className={styles.page}>
			<header>
				<h1>{t('outbox.title')}</h1>
				<p className={styles.lead}>{t('outbox.intro')}</p>
			</header>
			{body}
		</div>
	);
}
