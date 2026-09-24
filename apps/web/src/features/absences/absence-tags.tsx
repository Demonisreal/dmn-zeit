import type { Absence, AbsenceType } from '@zeit/shared';
import { useTranslation } from 'react-i18next';
import { Tag } from '../../components/ui/tag';

export function TypeTag({ type }: { type: AbsenceType }) {
	const { t } = useTranslation('absences');
	return <Tag>{t(`type.${type}`)}</Tag>;
}

const tones = {
	pending: 'warning',
	approved: 'success',
	rejected: 'neutral',
	withdrawn: 'neutral',
	cancel_pending: 'warning',
	cancelled: 'neutral'
} as const;

export function StatusTag({ absence }: { absence: Pick<Absence, 'type' | 'status'> }) {
	const { t } = useTranslation('absences');
	// sick leave is only reported, calling it approved would suggest someone decided on it
	if (absence.type === 'sick' && absence.status === 'approved') {
		return <Tag>{t('status.reported')}</Tag>;
	}
	return <Tag tone={tones[absence.status]}>{t(`status.${absence.status}`)}</Tag>;
}

type HalfDaysProps = {
	absence: Pick<Absence, 'startDate' | 'endDate' | 'halfDayStart' | 'halfDayEnd'>;
	className: string | undefined;
};

export function HalfDays({ absence, className }: HalfDaysProps) {
	const { t } = useTranslation('absences');
	const halves =
		absence.startDate === absence.endDate
			? [absence.halfDayStart && t('halfDay.single')]
			: [absence.halfDayStart && t('halfDay.start'), absence.halfDayEnd && t('halfDay.end')];
	const text = halves.filter(Boolean).join(', ');
	return text ? <span className={className}>{text}</span> : null;
}

export function SickNoteTag({ absence }: { absence: Pick<Absence, 'sickNote'> }) {
	const { t } = useTranslation('absences');
	return absence.sickNote ? (
		<Tag tone="success">{t('sickNote.confirmed')}</Tag>
	) : (
		<Tag>{t('sickNote.open')}</Tag>
	);
}
