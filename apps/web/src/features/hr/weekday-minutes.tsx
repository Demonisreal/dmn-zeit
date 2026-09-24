import { weekdays, type WeekdayMinutes as Minutes } from '@zeit/shared';
import { useTranslation } from 'react-i18next';
import { durationText } from './duration';
import styles from './weekday-minutes.module.css';

export const weekMinutes = (minutes: Minutes) =>
	weekdays.reduce((sum, day) => sum + minutes[day], 0);

export function WeekdayMinutes({ minutes }: { minutes: Minutes }) {
	const { t } = useTranslation('hr');
	const days = weekdays.filter((day) => minutes[day] > 0);
	if (days.length === 0) return <span className={styles.none}>{t('workModels.noDays')}</span>;
	return (
		<span className={styles.days}>
			{days.map((day) => (
				<span key={day} className={styles.day}>
					{t(`weekday.${day}`)} <span className={styles.minutes}>{durationText(minutes[day])}</span>
				</span>
			))}
		</span>
	);
}
