import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Notice } from '../../components/ui/notice';
import { Table } from '../../components/ui/table';
import { issueText } from '../../i18n';
import { formatDate, formatDays, formatMinutes } from '../../i18n/format';
import { hasCode } from '../../lib/api/errors';
import { useExplain } from '../vacation/explain';
import styles from './absence-preview.module.css';
import { previewQuery, type PreviewInput } from './api';
import { LoadError, Loading } from './ui/states';

type Props = {
	input: PreviewInput | null;
};

export function AbsencePreview({ input }: Props) {
	const { t, i18n } = useTranslation('absences');
	const explain = useExplain();
	const lng = i18n.language;
	const preview = useQuery({ ...previewQuery(input), placeholderData: keepPreviousData });

	const body = () => {
		if (!input) return <p className={styles.hint}>{t('preview.empty')}</p>;
		if (preview.isPending) return <Loading rows={3} />;
		if (preview.isError) {
			const err = preview.error;
			if (hasCode(err, 'VALIDATION') && Array.isArray(err.details) && err.details[0]) {
				return (
					<Notice tone="error">{issueText(err.details[0].message, err.details[0].params)}</Notice>
				);
			}
			if (hasCode(err, 'PERIOD_LOCKED')) return <Notice tone="error">{t('errors.locked')}</Notice>;
			return <LoadError error={err} onRetry={() => void preview.refetch()} />;
		}

		const cost = preview.data;
		const leave = input.type === 'vacation';
		const short = cost.remainingAfter !== null && Number(cost.remainingAfter) < 0;
		return (
			<>
				<dl
					className={styles.facts}
					data-stale={preview.isPlaceholderData || undefined}
					aria-live="polite"
				>
					{leave && (
						<div>
							<dt>{t('preview.vacationDays')}</dt>
							<dd>{formatDays(cost.vacationDays, lng)}</dd>
						</div>
					)}
					{leave &&
						cost.allocations.map((allocation) => (
							<div key={allocation.bucketYear} className={styles.sub}>
								<dt>{t('preview.fromBucket', { year: allocation.bucketYear })}</dt>
								<dd>{formatDays(allocation.days, lng)}</dd>
							</div>
						))}
					{cost.remainingAfter !== null && (
						<div>
							<dt>{t('preview.remainingAfter')}</dt>
							<dd data-short={short || undefined}>{formatDays(cost.remainingAfter, lng)}</dd>
						</div>
					)}
					<div>
						<dt>{t('preview.targetTime')}</dt>
						<dd>{formatMinutes(cost.targetMinutes)}</dd>
					</div>
					{input.type === 'time_off' && (
						<div>
							<dt>{t('preview.flexTime')}</dt>
							<dd>{formatMinutes(-cost.targetMinutes, { signed: true })}</dd>
						</div>
					)}
				</dl>
				{short && <Notice tone="warning">{t('preview.short')}</Notice>}
				{cost.overlapsWith.length > 0 && (
					<Notice tone="warning">
						{t(input.type === 'sick' ? 'preview.overlapSick' : 'preview.overlap', {
							count: cost.overlapsWith.length
						})}
					</Notice>
				)}
				<details className={styles.days}>
					<summary>{t('preview.days', { count: cost.days.length })}</summary>
					<Table label={t('preview.daysLabel')}>
						<thead>
							<tr>
								<th scope="col">{t('preview.date')}</th>
								<th scope="col" data-numeric>
									{t('preview.target')}
								</th>
								{leave && (
									<th scope="col" data-numeric>
										{t('preview.leave')}
									</th>
								)}
								<th scope="col">{t('preview.why')}</th>
							</tr>
						</thead>
						<tbody>
							{cost.days.map((day) => (
								<tr key={day.date} className={day.portion === 0 ? styles.off : undefined}>
									<td className={styles.date}>
										{formatDate(day.date, lng, { weekday: 'short', year: undefined })}
									</td>
									<td data-numeric>{formatMinutes(day.targetMinutes)}</td>
									{leave && <td data-numeric>{formatDays(day.vacationDays, lng)}</td>}
									<td>{explain(day.explanation)}</td>
								</tr>
							))}
						</tbody>
					</Table>
				</details>
			</>
		);
	};

	return (
		<section
			aria-labelledby="absence-preview-title"
			aria-busy={preview.isFetching || undefined}
			className={styles.preview}
		>
			<h3 id="absence-preview-title">{t('preview.title')}</h3>
			{body()}
		</section>
	);
}
