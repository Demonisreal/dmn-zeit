import { useInfiniteQuery, useQueryClient } from '@tanstack/react-query';
import type { Absence } from '@zeit/shared';
import { useTranslation } from 'react-i18next';
import { Tag } from '../../components/ui/tag';
import { formatDays, formatInstant, formatMinutes } from '../../i18n/format';
import { HalfDays, TypeTag } from '../absences/absence-tags';
import { absencesQuery, refreshAbsences } from '../absences/api';
import { formatPeriod } from '../absences/dates';
import { approveAbsence, rejectAbsence } from './api';
import { Decision } from './decision';
import styles from './inbox.module.css';
import { InboxSection } from './inbox-section';

type Props = {
	onDone: (message: string) => void;
};

export function AbsenceRequests({ onDone }: Props) {
	const { t } = useTranslation('inbox');
	const list = useInfiniteQuery(
		absencesQuery({ scope: 'inbox', status: ['pending', 'cancel_pending'] })
	);
	return (
		<InboxSection
			id="inbox-absences"
			title={t('absences.title')}
			empty={t('absences.empty')}
			list={list}
			items={list.data?.pages.flatMap((part) => part.items) ?? []}
		>
			{(absence) => <AbsenceRequest key={absence.id} absence={absence} onDone={onDone} />}
		</InboxSection>
	);
}

type RequestProps = {
	absence: Absence;
	onDone: (message: string) => void;
};

function AbsenceRequest({ absence, onDone }: RequestProps) {
	const { t, i18n } = useTranslation(['inbox', 'absences']);
	const lng = i18n.language;
	const queryClient = useQueryClient();
	const period = formatPeriod(absence.startDate, absence.endDate, lng);
	const name = absence.employee.name;
	const cancelling = absence.status === 'cancel_pending';
	const subject = `${name}, ${t(`absences:type.${absence.type}`)} ${period}`;

	return (
		<li className={styles.item}>
			<div className={styles.body}>
				<p className={styles.who}>{name}</p>
				<p className={styles.what}>
					<TypeTag type={absence.type} />{' '}
					{cancelling && <Tag tone="warning">{t('absences.cancelRequested')}</Tag>}{' '}
					<span className={styles.mono}>{period}</span>{' '}
					<HalfDays absence={absence} className={styles.quiet} />{' '}
					<span className={styles.amount}>
						{absence.type === 'vacation'
							? t('absences.days', { days: formatDays(absence.vacationDays, lng) })
							: formatMinutes(absence.targetMinutes)}
					</span>
				</p>
				{absence.note && <p className={styles.note}>{absence.note}</p>}
				<p className={styles.quiet}>
					{t('requestedAt', {
						date: formatInstant(absence.createdAt, lng, { dateStyle: 'medium' })
					})}
				</p>
			</div>
			<Decision
				label={cancelling ? `${subject}, ${t('absences.cancelRequested')}` : subject}
				onApprove={() => approveAbsence(absence.id)}
				onReject={(note) => rejectAbsence(absence.id, note)}
				onDone={async (outcome) => {
					await refreshAbsences(queryClient);
					const decided = {
						approved: cancelling ? 'decided.cancelApproved' : 'decided.approved',
						rejected: cancelling ? 'decided.cancelRejected' : 'decided.rejected'
					} as const;
					onDone(t(decided[outcome], { name }));
				}}
			/>
		</li>
	);
}
