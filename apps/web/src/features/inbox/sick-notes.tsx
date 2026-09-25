import { useInfiniteQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import type { Absence } from '@zeit/shared';
import { useTranslation } from 'react-i18next';
import { errorKey } from '../../app/error-key';
import { Button } from '../../components/ui/button';
import { formatInstant } from '../../i18n/format';
import { hasCode } from '../../lib/api/errors';
import { TypeTag } from '../absences/absence-tags';
import { absencesQuery, refreshAbsences } from '../absences/api';
import { formatPeriod } from '../absences/dates';
import { confirmSickNote, inboxRange } from './api';
import styles from './inbox.module.css';
import { InboxSection } from './inbox-section';

type Props = {
	employeeId: string | null;
	onDone: (message: string) => void;
};

export function SickNotes({ employeeId, onDone }: Props) {
	const { t } = useTranslation('inbox');
	// scope=inbox only ever returns pending/cancel_pending, a confirmed sick note is already approved
	const list = useInfiniteQuery(
		absencesQuery({ scope: 'all', ...inboxRange(), type: ['sick'], status: ['approved'] })
	);
	// the api has no filter for the certificate state, and nobody confirms their own note
	const open = (list.data?.pages.flatMap((part) => part.items) ?? []).filter(
		(absence) => absence.sickNote === null && absence.employee.id !== employeeId
	);
	return (
		<InboxSection
			id="inbox-sick-notes"
			title={t('sickNotes.title')}
			empty={t('sickNotes.empty')}
			list={list}
			items={open}
		>
			{(absence) => <SickNote key={absence.id} absence={absence} onDone={onDone} />}
		</InboxSection>
	);
}

type NoteProps = {
	absence: Absence;
	onDone: (message: string) => void;
};

function SickNote({ absence, onDone }: NoteProps) {
	const { t, i18n } = useTranslation(['inbox', 'common']);
	const lng = i18n.language;
	const queryClient = useQueryClient();
	const name = absence.employee.name;
	const period = formatPeriod(absence.startDate, absence.endDate, lng);
	const confirm = useMutation({
		mutationFn: () => confirmSickNote(absence.id),
		onSuccess: async () => {
			await refreshAbsences(queryClient);
			onDone(t('sickNotes.confirmed', { name }));
		}
	});

	const failure = (err: Error) => {
		if (hasCode(err, 'FORBIDDEN')) return t('errors.forbidden');
		if (hasCode(err, 'INVALID_STATE')) return t('errors.invalidState');
		return t(errorKey(err));
	};

	return (
		<li className={styles.item}>
			<div className={styles.body}>
				<p className={styles.who}>{name}</p>
				<p className={styles.what}>
					<TypeTag type="sick" /> <span className={styles.mono}>{period}</span>
				</p>
				<p className={styles.quiet}>
					{t('sickNotes.reportedAt', {
						date: formatInstant(absence.createdAt, lng, { dateStyle: 'medium' })
					})}
				</p>
			</div>
			<div className={styles.decision}>
				<Button
					isPending={confirm.isPending}
					aria-label={t('sickNotes.confirmFor', { name, period })}
					onPress={() => confirm.mutate()}
				>
					{t('sickNotes.confirm')}
				</Button>
				{confirm.error && (
					<p role="alert" className={styles.error}>
						{failure(confirm.error)}
					</p>
				)}
			</div>
		</li>
	);
}
