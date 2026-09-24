import { useQuery } from '@tanstack/react-query';
import { useRouter } from '@tanstack/react-router';
import { weekdays, type Timesheet } from '@zeit/shared';
import { useTranslation } from 'react-i18next';
import { Button } from '../../../components/ui/button';
import { formatDate, formatMinutes, formatTime } from '../../../i18n/format';
import { timesheetQuery } from '../api';
import { formatInstant, formatMonth, lastDayOf } from '../dates';
import { Loading, LoadError } from '../ui/states';
import styles from './timesheet-sheet.module.css';

type Props = {
	employeeId: string;
	month: string;
};

type Day = Timesheet['days'][number];

// getUTCDay counts from sunday, the shared weekdays start on monday
const weekdayOf = (iso: string) => weekdays[(new Date(`${iso}T00:00:00Z`).getUTCDay() + 6) % 7]!;

export function TimesheetSheet({ employeeId, month }: Props) {
	const { t, i18n } = useTranslation('hr');
	const router = useRouter();
	const timesheet = useQuery(timesheetQuery(employeeId, month));
	const lng = i18n.language;

	const note = (day: Day) => {
		const parts: string[] = [];
		if (day.holiday) parts.push(t('print.holiday'));
		if (day.absence) {
			parts.push(
				day.absence.portion === 0.5
					? t('print.halfDay', { type: t(`print.absence.${day.absence.type}`) })
					: t(`print.absence.${day.absence.type}`)
			);
		}
		return parts.join(', ');
	};

	const spans = (day: Day) =>
		day.entries
			.map((entry) =>
				entry.endedAt
					? `${formatTime(entry.startedAt, lng)}–${formatTime(entry.endedAt, lng)}`
					: t('print.running', { from: formatTime(entry.startedAt, lng) })
			)
			.join(', ');

	let sheet;
	if (timesheet.isError) {
		sheet = <LoadError error={timesheet.error} onRetry={() => void timesheet.refetch()} />;
	} else if (!timesheet.data) {
		sheet = <Loading rows={10} />;
	} else {
		const { tenant, employee, days, totals, closed, flexBalanceMinutes, generatedAt } =
			timesheet.data;
		sheet = (
			<article className={styles.sheet}>
				<header className={styles.head}>
					<p className={styles.tenant}>{tenant.name}</p>
					<h1>{t('print.title', { month: formatMonth(month, lng) })}</h1>
					<dl className={styles.meta}>
						<dt>{t('people.name')}</dt>
						<dd>{employee.name}</dd>
						<dt>{t('people.personnelNo')}</dt>
						<dd>{employee.personnelNo}</dd>
						<dt>{t('print.period')}</dt>
						<dd>
							{formatDate(`${month}-01`, lng)} – {formatDate(lastDayOf(month), lng)}
						</dd>
						<dt>{t('print.state')}</dt>
						<dd>{closed ? t('print.closed') : t('print.provisional')}</dd>
					</dl>
				</header>
				<table className={styles.table}>
					<thead>
						<tr>
							<th scope="col">{t('print.date')}</th>
							<th scope="col">{t('print.entries')}</th>
							<th scope="col" className={styles.num}>
								{t('print.break')}
							</th>
							<th scope="col" className={styles.num}>
								{t('flex.worked')}
							</th>
							<th scope="col" className={styles.num}>
								{t('flex.target')}
							</th>
							<th scope="col" className={styles.num}>
								{t('flex.diff')}
							</th>
							<th scope="col">{t('print.note')}</th>
						</tr>
					</thead>
					<tbody>
						{days.map((day) => (
							<tr key={day.date}>
								<td className={styles.date}>
									<span className={styles.weekday}>{t(`weekday.${weekdayOf(day.date)}`)}</span>{' '}
									{formatDate(day.date, lng, { year: undefined })}
								</td>
								<td>{spans(day)}</td>
								<td className={styles.num}>
									{day.breakMinutes > 0 ? formatMinutes(day.breakMinutes) : ''}
								</td>
								<td className={styles.num}>
									{day.workedMinutes > 0 ? formatMinutes(day.workedMinutes) : ''}
								</td>
								<td className={styles.num}>
									{day.targetMinutes > 0 ? formatMinutes(day.targetMinutes) : ''}
								</td>
								<td className={styles.num}>
									{day.diffMinutes !== 0 ? formatMinutes(day.diffMinutes, { signed: true }) : ''}
								</td>
								<td>{note(day)}</td>
							</tr>
						))}
					</tbody>
					<tfoot>
						<tr>
							<th scope="row" colSpan={3}>
								{t('print.total')}
							</th>
							<td className={styles.num}>{formatMinutes(totals.workedMinutes)}</td>
							<td className={styles.num}>{formatMinutes(totals.targetMinutes)}</td>
							<td className={styles.num}>{formatMinutes(totals.diffMinutes, { signed: true })}</td>
							<td />
						</tr>
					</tfoot>
				</table>
				<dl className={styles.meta}>
					<dt>{t('print.credited')}</dt>
					<dd>{formatMinutes(totals.creditedMinutes)}</dd>
					<dt>{t('print.balance')}</dt>
					<dd>{formatMinutes(flexBalanceMinutes, { signed: true })}</dd>
				</dl>
				<div className={styles.signatures}>
					<p>{t('print.signEmployee')}</p>
					<p>{t('print.signEmployer')}</p>
				</div>
				<footer className={styles.foot}>
					{t('print.generated', { at: formatInstant(generatedAt, lng) })}
				</footer>
			</article>
		);
	}

	return (
		<div className={styles.page}>
			<div className={styles.toolbar}>
				<Button variant="quiet" onPress={() => router.history.back()}>
					{t('print.back')}
				</Button>
				<Button variant="primary" isDisabled={!timesheet.data} onPress={() => window.print()}>
					{t('print.print')}
				</Button>
			</div>
			{sheet}
		</div>
	);
}
