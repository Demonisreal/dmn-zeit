import type { Day } from '@zeit/shared';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Tag } from '../../components/ui/tag';
import { formatDate, formatMinutes } from '../../i18n/format';
import { CorrectionSection } from './correction-section';
import styles from './day-detail.module.css';
import { DayEntries } from './day-entries';
import { dateOf } from './dates';
import { paragraph, useExplain } from './explain';

export type DayFinding = Day['findings'][number];
export type FindingAction = (day: Day, finding: DayFinding) => ReactNode;

type Props = {
	day: Day;
	employeeId: string;
	extra: number;
	now: number;
	isFuture: boolean;
	canCorrect: boolean;
	findingAction?: FindingAction | undefined;
};

export function DayDetail({
	day,
	employeeId,
	extra,
	now,
	isFuture,
	canCorrect,
	findingAction
}: Props) {
	const { t, i18n } = useTranslation('week');
	const explain = useExplain();

	return (
		<div className={styles.detail}>
			<section className={styles.block}>
				<h3>{t('detail.entries')}</h3>
				<DayEntries day={day} now={now} />
			</section>

			<section className={styles.block}>
				<h3>{t('detail.calc')}</h3>
				<dl className={styles.calc}>
					{!isFuture && (
						<div>
							<dt>
								<span aria-hidden="true" />
								{t('detail.worked')}
							</dt>
							<dd>
								<span className={styles.amount}>{formatMinutes(day.workedMinutes + extra)}</span>
								<span className={styles.hint}>{t('detail.workedHint')}</span>
							</dd>
						</div>
					)}
					{day.creditedMinutes > 0 && (
						<div>
							<dt>
								<span aria-hidden="true">+</span>
								{t('detail.credited')}
							</dt>
							<dd>
								<span className={styles.amount}>{formatMinutes(day.creditedMinutes)}</span>
								{day.absence && (
									<span className={styles.hint}>{t(`absence.${day.absence.type}`)}</span>
								)}
							</dd>
						</div>
					)}
					<div>
						<dt>
							<span aria-hidden="true">{!isFuture && '−'}</span>
							{t('detail.target')}
						</dt>
						<dd>
							<span className={styles.amount}>{formatMinutes(day.target.minutes)}</span>
							<span className={styles.hint}>{explain.target(day.target.explanation)}</span>
						</dd>
					</div>
					{!isFuture && (
						<div className={styles.result}>
							<dt>
								<span aria-hidden="true">=</span>
								{t('detail.diff')}
							</dt>
							<dd>
								<span className={styles.amount}>
									{formatMinutes(day.diffMinutes + extra, { signed: true })}
								</span>
							</dd>
						</div>
					)}
				</dl>
				{day.holiday && (
					<p className={styles.line}>
						{t('detail.holiday')}: {t(`holiday.${day.holiday.code}`)}
						{day.holiday.portion === 0.5 && `, ${t('detail.halfDay')}`}
					</p>
				)}
				{day.absence && (
					<p className={styles.line}>
						{t('detail.absence')}: {t(`absence.${day.absence.type}`)},{' '}
						{t(`absenceStatus.${day.absence.status}`)}
						{day.absence.portion === 0.5 && `, ${t('detail.halfDay')}`}
					</p>
				)}
			</section>

			{day.findings.length > 0 && (
				<section className={`${styles.block} ${styles.wide}`}>
					<h3>{t('detail.findings')}</h3>
					<ul className={styles.findings}>
						{day.findings.map((finding) => (
							<li key={finding.code}>
								<Tag tone={finding.severity === 'warning' && !finding.ack ? 'error' : 'neutral'}>
									{paragraph(finding.code)} ArbZG
								</Tag>
								<div className={styles.finding}>
									<p>{explain.finding(finding.code, finding.facts)}</p>
									<p className={styles.hint}>
										{t('detail.ruleVersion', { version: finding.ruleVersion })}
									</p>
									{finding.ack ? (
										<p className={styles.acked}>
											{t('detail.acked', {
												name: finding.ack.by.displayName,
												date: formatDate(dateOf(finding.ack.at), i18n.language)
											})}
											{finding.ack.note && `: ${finding.ack.note}`}
										</p>
									) : (
										findingAction?.(day, finding)
									)}
								</div>
							</li>
						))}
					</ul>
					<p className={styles.hint}>{t('detail.legal')}</p>
				</section>
			)}

			{canCorrect &&
				!isFuture &&
				(day.locked ? (
					<p className={`${styles.hint} ${styles.wide}`}>{t('detail.locked')}</p>
				) : (
					<div className={styles.wide}>
						<CorrectionSection day={day} employeeId={employeeId} />
					</div>
				))}
		</div>
	);
}
