import type { VacationAccount, VacationBucket } from '@zeit/shared';
import { useState } from 'react';
import { VisuallyHidden } from 'react-aria-components';
import { useTranslation } from 'react-i18next';
import { Table } from '../../components/ui/table';
import { formatDate, formatDays } from '../../i18n/format';
import { BucketDetail } from './bucket-detail';
import styles from './vacation.module.css';

type Props = {
	account: VacationAccount;
};

export function BucketTable({ account }: Props) {
	const { t, i18n } = useTranslation('vacation');
	const lng = i18n.language;
	const [open, setOpen] = useState(() => new Set([account.year]));

	const toggle = (year: number) =>
		setOpen((before) => {
			const next = new Set(before);
			if (!next.delete(year)) next.add(year);
			return next;
		});

	return (
		<div
			className={styles.scroll}
			role="region"
			aria-label={t('account.label', { year: account.year })}
			tabIndex={0}
		>
			<Table label={t('account.label', { year: account.year })}>
				<thead>
					<tr>
						<th scope="col">{t('account.bucket')}</th>
						<th scope="col" data-numeric>
							{t('account.entitlement')}
						</th>
						<th scope="col" data-numeric data-priority="mid">
							{t('account.taken')}
						</th>
						<th scope="col" data-numeric data-priority="mid">
							{t('account.refunded')}
						</th>
						<th scope="col" data-numeric data-priority="mid">
							{t('account.adjusted')}
						</th>
						<th scope="col" data-numeric data-priority="mid">
							{t('account.expired')}
						</th>
						<th scope="col" data-numeric>
							{t('account.remaining')}
						</th>
						<th scope="col" data-priority="mid">
							{t('account.deadline')}
						</th>
					</tr>
				</thead>
				{account.buckets.map((bucket) => (
					<BucketRows
						key={bucket.year}
						bucket={bucket}
						account={account}
						open={open.has(bucket.year)}
						onToggle={() => toggle(bucket.year)}
					/>
				))}
				<tfoot>
					<tr>
						<td colSpan={2}>
							{t('account.available')}
							{Number(account.pending) > 0 && (
								<span className={styles.pending}>
									{t('account.pending', { days: formatDays(account.pending, lng) })}
								</span>
							)}
						</td>
						<td data-priority="mid" />
						<td data-priority="mid" />
						<td data-priority="mid" />
						<td data-priority="mid" />
						<td data-numeric>{formatDays(account.available, lng)}</td>
						<td data-priority="mid" />
					</tr>
				</tfoot>
			</Table>
		</div>
	);
}

type RowsProps = {
	bucket: VacationBucket;
	account: VacationAccount;
	open: boolean;
	onToggle: () => void;
};

function BucketRows({ bucket, account, open, onToggle }: RowsProps) {
	const { t, i18n } = useTranslation('vacation');
	const lng = i18n.language;
	const detail = `bucket-${bucket.year}`;
	return (
		<tbody>
			<tr>
				<th scope="row" className={styles.bucket}>
					<button
						type="button"
						className={styles.toggle}
						aria-expanded={open}
						aria-controls={open ? detail : undefined}
						onClick={onToggle}
					>
						<span className={styles.caret} aria-hidden="true" />
						<span className={styles.year}>{bucket.year}</span>{' '}
						{bucket.year < account.year && (
							<span className={styles.carry}>{t('account.carryOver')}</span>
						)}
						<VisuallyHidden>{t('account.derivation')}</VisuallyHidden>
					</button>
				</th>
				<td data-numeric>{formatDays(bucket.entitlement, lng)}</td>
				<td data-numeric data-priority="mid">
					{formatDays(bucket.taken, lng)}
				</td>
				<td data-numeric data-priority="mid">
					{formatDays(bucket.refunded, lng)}
				</td>
				<td data-numeric data-priority="mid">
					{formatDays(bucket.adjusted, lng)}
				</td>
				<td data-numeric data-priority="mid">
					{formatDays(bucket.expired, lng)}
				</td>
				<td data-numeric className={styles.remaining}>
					{formatDays(bucket.remaining, lng)}
				</td>
				<td className={styles.deadline} data-priority="mid">
					{bucket.deadline ? formatDate(bucket.deadline, lng) : t('account.noDeadline')}
				</td>
			</tr>
			{open && (
				<tr className={styles.detailRow}>
					<td id={detail} colSpan={8}>
						<BucketDetail bucket={bucket} account={account} />
					</td>
				</tr>
			)}
		</tbody>
	);
}
