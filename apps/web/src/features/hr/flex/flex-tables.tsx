import type { FlexBooking, FlexMonth } from '@zeit/shared';
import { useTranslation } from 'react-i18next';
import { EmptyState } from '../../../components/ui/empty-state';
import { Table } from '../../../components/ui/table';
import { Tag } from '../../../components/ui/tag';
import { formatDate, formatMinutes, formatMonth } from '../../../i18n/format';
import styles from '../ui/page.module.css';

export function FlexBookings({ bookings }: { bookings: FlexBooking[] }) {
	const { t, i18n } = useTranslation('hr');
	if (bookings.length === 0) return <EmptyState title={t('flex.noBookings')} />;
	return (
		<div className={styles.scroll} role="region" aria-label={t('flex.bookings')} tabIndex={0}>
			<Table label={t('flex.bookings')}>
				<thead>
					<tr>
						<th scope="col">{t('flex.effectiveDate')}</th>
						<th scope="col">{t('flex.type')}</th>
						<th scope="col" data-numeric>
							{t('flex.minutes')}
						</th>
						<th scope="col">{t('flex.reason')}</th>
						<th scope="col">{t('flex.createdBy')}</th>
					</tr>
				</thead>
				<tbody>
					{bookings
						.toSorted((a, b) => b.effectiveDate.localeCompare(a.effectiveDate))
						.map((booking) => (
							<tr key={booking.id}>
								<td className={styles.mono}>{formatDate(booking.effectiveDate, i18n.language)}</td>
								<td>
									<Tag>{t(`flex.types.${booking.type}`)}</Tag>
								</td>
								<td data-numeric>{formatMinutes(booking.minutes, { signed: true })}</td>
								<td>{booking.reason}</td>
								<td className={styles.small}>
									{booking.createdBy?.displayName ?? t('flex.bySystem')}
								</td>
							</tr>
						))}
				</tbody>
			</Table>
		</div>
	);
}

export function FlexMonths({ months }: { months: FlexMonth[] }) {
	const { t, i18n } = useTranslation('hr');
	if (months.length === 0) return <EmptyState title={t('flex.noMonths')} />;
	return (
		<div className={styles.scroll} role="region" aria-label={t('flex.months')} tabIndex={0}>
			<Table label={t('flex.months')}>
				<thead>
					<tr>
						<th scope="col">{t('flex.month')}</th>
						<th scope="col" data-numeric>
							{t('flex.target')}
						</th>
						<th scope="col" data-numeric>
							{t('flex.worked')}
						</th>
						<th scope="col" data-numeric>
							{t('flex.credited')}
						</th>
						<th scope="col" data-numeric>
							{t('flex.booked')}
						</th>
						<th scope="col" data-numeric>
							{t('flex.diff')}
						</th>
						<th scope="col" data-numeric>
							{t('flex.balance')}
						</th>
					</tr>
				</thead>
				<tbody>
					{months.map((month) => (
						<tr key={month.month}>
							<td>
								{formatMonth(month.month, i18n.language)}{' '}
								{month.closed && <Tag>{t('months.closed')}</Tag>}
							</td>
							<td data-numeric>{formatMinutes(month.targetMinutes)}</td>
							<td data-numeric>{formatMinutes(month.workedMinutes)}</td>
							<td data-numeric>{formatMinutes(month.creditedMinutes)}</td>
							<td data-numeric>{formatMinutes(month.bookedMinutes, { signed: true })}</td>
							<td data-numeric>{formatMinutes(month.diffMinutes, { signed: true })}</td>
							<td data-numeric>{formatMinutes(month.balanceMinutes, { signed: true })}</td>
						</tr>
					))}
				</tbody>
			</Table>
		</div>
	);
}
