import type { CoverageHint, DayCoverage } from '@zeit/shared';
import { VisuallyHidden } from 'react-aria-components';
import { useTranslation } from 'react-i18next';
import { Tag } from '../../components/ui/tag';
import { formatMinutes } from '../../i18n/format';
import styles from './coverage-row.module.css';
import matrix from './matrix-table.module.css';

type Props = {
	coverage: DayCoverage[];
	days: string[];
	day: string;
	today: string;
	withAmount: boolean;
};

type Measure = 'workedMinutes' | 'unassignedMinutes' | 'outsideMinutes';

export function CoverageRows({ coverage, days, day, today, withAmount }: Props) {
	const { t } = useTranslation('projects');
	const byDate = new Map(coverage.map((day) => [day.date, day]));
	const priority = (date: string) => (date === day ? undefined : 'mid');
	const hinted = [...new Set(coverage.flatMap((day) => day.hints))];

	const hint = (code: CoverageHint) => (
		<span key={code} title={t(`coverage.hint.${code}`)}>
			<Tag>{t(`coverage.tag.${code}`)}</Tag>
			<VisuallyHidden elementType="span">, {t(`coverage.hint.${code}`)}</VisuallyHidden>
		</span>
	);

	const line = (measure: Measure, label: string) => (
		<tr className={measure === 'workedMinutes' ? `${styles.row} ${styles.first}` : styles.row}>
			<th scope="row">{label}</th>
			{days.map((date) => {
				const minutes = date > today ? 0 : (byDate.get(date)?.[measure] ?? 0);
				return (
					<td key={date} data-numeric data-priority={priority(date)}>
						{minutes > 0 ? (
							formatMinutes(minutes)
						) : (
							<span className={matrix.blank} aria-hidden="true">
								–
							</span>
						)}
					</td>
				);
			})}
			<td data-numeric>{formatMinutes(coverage.reduce((sum, day) => sum + day[measure], 0))}</td>
			{withAmount && <td data-priority="wide" />}
		</tr>
	);

	return (
		<>
			{line('workedMinutes', t('coverage.worked'))}
			{line('unassignedMinutes', t('coverage.unassigned'))}
			{line('outsideMinutes', t('coverage.outside'))}
			{hinted.length > 0 && (
				<tr className={styles.row}>
					<th scope="row">{t('coverage.hints')}</th>
					{days.map((date) => (
						<td key={date} data-priority={priority(date)}>
							<span className={styles.tags}>{byDate.get(date)?.hints.map(hint)}</span>
						</td>
					))}
					<td>
						<span className={styles.tags}>{hinted.map(hint)}</span>
					</td>
					{withAmount && <td data-priority="wide" />}
				</tr>
			)}
		</>
	);
}
