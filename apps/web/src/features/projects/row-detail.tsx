import { useTranslation } from 'react-i18next';
import { formatCents, formatMinutes } from '../../i18n/format';
import detail from '../week/day-detail.module.css';
import { shortDate, weekdayShort } from '../week/dates';
import styles from './cell-detail.module.css';
import { useExplain } from './explain';
import type { Line } from './matrix-rows';

type Props = {
	line: Line;
	days: string[];
	withAmount: boolean;
	onDay: (date: string) => void;
};

// the sum spelled out day by day; on phones this is the only way to the days
export function RowDetail({ line, days, withAmount, onDay }: Props) {
	const { t, i18n } = useTranslation('projects');
	const explain = useExplain();
	const lng = i18n.language;
	const { rowTotal } = line.row;

	return (
		<div className={detail.detail}>
			<section className={`${detail.block} ${detail.wide}`}>
				<h3>{t('detail.days')}</h3>
				<ol className={detail.timeline}>
					{days.flatMap((date) => {
						const cell = line.cells.get(date);
						if (!cell) return [];
						return (
							<li key={date}>
								<button type="button" className={styles.day} onClick={() => onDay(date)}>
									{weekdayShort(date, lng)} {shortDate(date, lng)}
								</button>
								<span className={detail.amount}>{formatMinutes(cell.roundedMinutes)}</span>
								{withAmount && cell.amountCents !== null && (
									<span className={`${detail.amount} ${styles.money}`}>
										{formatCents(cell.amountCents, lng)}
									</span>
								)}
								<span className={detail.hint}>{explain(cell.derivation.rounding)}</span>
							</li>
						);
					})}
				</ol>
				<p className={`${detail.line} ${styles.sum}`}>
					<span>{t('detail.weekSum')}</span>
					<span className={detail.amount}>{formatMinutes(rowTotal.roundedMinutes)}</span>
					{withAmount && rowTotal.amountCents !== null && (
						<span className={`${detail.amount} ${styles.money}`}>
							{formatCents(rowTotal.amountCents, lng)}
						</span>
					)}
				</p>
			</section>
		</div>
	);
}
