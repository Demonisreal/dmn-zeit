import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { VacationBucket } from '@zeit/shared';
import { useTranslation } from 'react-i18next';
import { errorKey } from '../../app/error-key';
import { Button } from '../../components/ui/button';
import { Notice } from '../../components/ui/notice';
import { formatDate, formatDays, formatInstant } from '../../i18n/format';
import { acknowledgeNotice } from './api';
import styles from './vacation.module.css';

type Props = {
	bucket: VacationBucket;
	notice: NonNullable<VacationBucket['notice']>;
	onAcknowledged: () => void;
};

export function ForfeitureNotice({ bucket, notice, onAcknowledged }: Props) {
	const { t, i18n } = useTranslation(['vacation', 'common']);
	const lng = i18n.language;
	const queryClient = useQueryClient();
	const acknowledge = useMutation({
		mutationFn: () => acknowledgeNotice(notice.id),
		onSuccess: onAcknowledged,
		onSettled: () => queryClient.invalidateQueries({ queryKey: ['vacation'] })
	});

	return (
		<Notice
			action={
				<Button
					variant="secondary"
					isPending={acknowledge.isPending}
					onPress={() => acknowledge.mutate()}
				>
					{t('forfeiture.acknowledge')}
				</Button>
			}
		>
			<p>
				{t('forfeiture.text', {
					year: bucket.year,
					days: formatDays(bucket.remaining, lng),
					deadline: formatDate(notice.deadline, lng)
				})}
			</p>
			<p className={styles.quiet}>
				{t('forfeiture.sent', {
					sent: formatInstant(notice.sentAt, lng, { dateStyle: 'medium' })
				})}
			</p>
			{acknowledge.error && (
				<p role="alert" className={styles.error}>
					{t(errorKey(acknowledge.error))}
				</p>
			)}
		</Notice>
	);
}
