import type { VacationAccount, VacationBucket } from '@zeit/shared';
import { useTranslation } from 'react-i18next';
import { Table } from '../../components/ui/table';
import { formatDate, formatDays, formatInstant } from '../../i18n/format';
import { useExplain } from './explain';
import styles from './vacation.module.css';

type Props = {
	bucket: VacationBucket;
	account: VacationAccount;
};

const hundredths = (days: string) => Math.round(Number(days) * 100);
const asDays = (hundreds: number) => (hundreds / 100).toFixed(2);

export function BucketDetail({ bucket, account }: Props) {
	const { t, i18n } = useTranslation('vacation');
	const explain = useExplain();
	const lng = i18n.language;
	const day = (instant: string) => formatInstant(instant, lng, { dateStyle: 'medium' });

	const ledger = account.ledger
		.filter((entry) => entry.bucketYear === bucket.year)
		.toSorted(
			(a, b) =>
				a.effectiveDate.localeCompare(b.effectiveDate) || a.createdAt.localeCompare(b.createdAt)
		);
	const entries: ((typeof ledger)[number] & { balance: string })[] = [];
	let balance = 0;
	for (const entry of ledger) {
		balance += hundredths(entry.days);
		entries.push({ ...entry, balance: asDays(balance) });
	}
	const notices = account.buckets.flatMap((other) => (other.notice ? [other.notice] : []));

	const noticeState = () => {
		const { notice } = bucket;
		if (!notice) return t('notice.none');
		if (!notice.acknowledgedAt) return t('notice.open', { sent: day(notice.sentAt) });
		return t('notice.acknowledged', {
			sent: day(notice.sentAt),
			acknowledged: day(notice.acknowledgedAt)
		});
	};

	return (
		<div className={styles.detail}>
			<dl className={styles.figures}>
				<dt>{t('account.taken')}</dt>
				<dd>{formatDays(bucket.taken, lng)}</dd>
				<dt>{t('account.refunded')}</dt>
				<dd>{formatDays(bucket.refunded, lng)}</dd>
				<dt>{t('account.adjusted')}</dt>
				<dd>{formatDays(bucket.adjusted, lng)}</dd>
				<dt>{t('account.expired')}</dt>
				<dd>{formatDays(bucket.expired, lng)}</dd>
				<dt>{t('account.deadline')}</dt>
				<dd>{bucket.deadline ? formatDate(bucket.deadline, lng) : t('account.noDeadline')}</dd>
			</dl>
			{bucket.year === account.year && (
				<div className={styles.block}>
					<h3>
						{t('derivation.entitlement', {
							year: account.year,
							days: formatDays(account.entitlement.days, lng)
						})}
					</h3>
					<ul className={styles.reasons}>
						{account.entitlement.explanations.map((explanation) => (
							<li key={explanation.key}>{explain(explanation)}</li>
						))}
					</ul>
				</div>
			)}

			<div className={styles.block}>
				<h3>{t('derivation.ledger')}</h3>
				{entries.length === 0 ? (
					<p className={styles.quiet}>{t('derivation.noEntries')}</p>
				) : (
					<Table label={t('derivation.ledgerLabel', { year: bucket.year })}>
						<thead>
							<tr>
								<th scope="col">{t('ledger.date')}</th>
								<th scope="col">{t('ledger.entry')}</th>
								<th scope="col" data-numeric>
									{t('ledger.days')}
								</th>
								<th scope="col" data-numeric data-priority="mid">
									{t('ledger.balance')}
								</th>
							</tr>
						</thead>
						<tbody>
							{entries.map((entry) => {
								const source = notices.find((other) => other.id === entry.noticeId);
								const remark =
									entry.reason ?? (source && t('ledger.notice', { date: day(source.sentAt) }));
								return (
									<tr key={entry.id}>
										<td className={styles.date}>{formatDate(entry.effectiveDate, lng)}</td>
										<td>
											{t(`ledger.type.${entry.entryType}`)}
											{remark && <span className={styles.remark}>{remark}</span>}
										</td>
										<td data-numeric>
											{Number(entry.days) > 0 ? '+' : ''}
											{formatDays(entry.days, lng)}
										</td>
										<td data-numeric data-priority="mid">
											{formatDays(entry.balance, lng)}
										</td>
									</tr>
								);
							})}
						</tbody>
					</Table>
				)}
			</div>

			<p className={styles.expiry}>
				<span className={styles.label}>{t('derivation.expiry')}</span>{' '}
				{explain(bucket.expiry.explanation)}. {noticeState()}
			</p>
		</div>
	);
}
