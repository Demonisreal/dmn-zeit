import { isWeekend, parseDate } from '@internationalized/date';
import { Link } from '@tanstack/react-router';
import type { TeamCalendar } from '@zeit/shared';
import { useLayoutEffect, useRef } from 'react';
import { VisuallyHidden } from 'react-aria-components';
import { useTranslation } from 'react-i18next';
import { tagFor } from '../../i18n/format';
import { todayIso } from '../../lib/dates';
import { useHolidayName } from '../vacation/explain';
import styles from './team-grid.module.css';

type Props = {
	calendar: TeamCalendar;
	labelledBy: string;
	linkPeople: boolean;
};

type Day = TeamCalendar['people'][number]['days'][number];

export function TeamGrid({ calendar, labelledBy, linkPeople }: Props) {
	const { t, i18n } = useTranslation('team');
	const holidayName = useHolidayName();
	const scroller = useRef<HTMLDivElement>(null);
	const locale = tagFor(i18n.language);
	const first = parseDate(`${calendar.month}-01`);
	const dates = Array.from({ length: first.calendar.getDaysInMonth(first) }, (_, i) =>
		first.add({ days: i })
	);
	const today = todayIso();
	const weekday = new Intl.DateTimeFormat(locale, { weekday: 'narrow', timeZone: 'UTC' });
	const spoken = new Intl.DateTimeFormat(locale, {
		weekday: 'short',
		day: '2-digit',
		month: '2-digit',
		timeZone: 'UTC'
	});
	const columns = dates.map((date) => {
		const iso = date.toString();
		const holiday = calendar.holidays.find((day) => day.date === iso);
		return {
			date,
			iso,
			holiday: holiday && holidayName(holiday.code),
			off: isWeekend(date, locale) || holiday?.portion === 1,
			today: iso === today,
			monday: date.toDate('UTC').getUTCDay() === 1
		};
	});
	const absentOn = (iso: string) =>
		calendar.people.filter((person) => person.days.some((day) => day.date === iso)).length;

	const label = (day: Day) =>
		[
			t(`kind.${day.type}`),
			day.status === 'pending' && t('pending'),
			day.status === 'cancel_pending' && t('cancelPending'),
			day.portion === 0.5 && t('halfDay')
		]
			.filter(Boolean)
			.join(', ');

	const flags = (column: (typeof columns)[number]) => ({
		'data-off': column.off || undefined,
		'data-today': column.today || undefined,
		'data-monday': column.monday || undefined
	});

	// open on today plus three days ahead, scrollIntoView would scroll the page along with the grid
	useLayoutEffect(() => {
		const box = scroller.current;
		if (!box) return;
		const cell = box.querySelector<HTMLElement>('thead [data-today]');
		box.scrollLeft = cell ? cell.offsetLeft + 4 * cell.offsetWidth - box.clientWidth : 0;
	}, [calendar.month]);

	return (
		<div
			ref={scroller}
			className={styles.scroll}
			role="region"
			aria-labelledby={labelledBy}
			tabIndex={0}
		>
			<table className={styles.grid}>
				<thead>
					<tr>
						<th scope="col" className={styles.person}>
							{t('person')}
						</th>
						{columns.map((column) => (
							<th key={column.iso} scope="col" title={column.holiday} {...flags(column)}>
								<span aria-hidden="true" className={styles.weekday}>
									{weekday.format(column.date.toDate('UTC'))}
								</span>
								<span aria-hidden="true">{column.date.day}</span>
								<VisuallyHidden>
									{[
										spoken.format(column.date.toDate('UTC')),
										column.holiday,
										column.today && t('today')
									]
										.filter(Boolean)
										.join(', ')}
								</VisuallyHidden>
							</th>
						))}
					</tr>
				</thead>
				<tbody>
					{calendar.people.map((person) => (
						<tr key={person.employee.id}>
							<th scope="row" className={styles.person}>
								{linkPeople ? (
									<Link to="/time" search={{ employee: person.employee.id, month: calendar.month }}>
										{person.employee.name}
									</Link>
								) : (
									person.employee.name
								)}
							</th>
							{columns.map((column) => {
								const day = person.days.find((entry) => entry.date === column.iso);
								return (
									<td key={column.iso} {...flags(column)}>
										{day && (
											<>
												<span
													className={styles.mark}
													data-pending={day.status === 'pending' || undefined}
													data-half={day.portion === 0.5 || undefined}
													aria-hidden="true"
												>
													{t(`code.${day.type}`)}
												</span>
												<VisuallyHidden>{label(day)}</VisuallyHidden>
											</>
										)}
									</td>
								);
							})}
						</tr>
					))}
				</tbody>
				<tfoot>
					<tr>
						<th scope="row" className={styles.person}>
							{t('absentCount')}
						</th>
						{columns.map((column) => {
							const count = absentOn(column.iso);
							return (
								<td key={column.iso} {...flags(column)}>
									{count > 0 && count}
								</td>
							);
						})}
					</tr>
				</tfoot>
			</table>
		</div>
	);
}
