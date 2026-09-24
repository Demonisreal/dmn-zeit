import { useInfiniteQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
	absenceStatuses,
	absenceTypes,
	type Absence,
	type AbsenceStatus,
	type AbsenceType
} from '@zeit/shared';
import { useState } from 'react';
import { VisuallyHidden } from 'react-aria-components';
import { useTranslation } from 'react-i18next';
import { errorKey } from '../../app/error-key';
import { Button } from '../../components/ui/button';
import { EmptyState } from '../../components/ui/empty-state';
import { Table } from '../../components/ui/table';
import { formatDays, formatMinutes } from '../../i18n/format';
import { hasCode } from '../../lib/api/errors';
import { HalfDays, SickNoteTag, StatusTag, TypeTag } from './absence-tags';
import styles from './absence-list.module.css';
import { absencesQuery, refreshAbsences, withdrawAbsence } from './api';
import { CancelDialog } from './cancel-dialog';
import { formatInstant, formatPeriod, todayIso, yearSpan } from './dates';
import page from './ui/page.module.css';
import { PeriodStepper } from './ui/period-stepper';
import { SelectField } from './ui/select-field';
import { LoadError, Loading } from './ui/states';

export type AbsenceListFilter = {
	year: number;
	type: AbsenceType | undefined;
	status: AbsenceStatus | undefined;
};

type Props = AbsenceListFilter & {
	onFilter: (next: Partial<AbsenceListFilter>) => void;
};

export function AbsenceList({ year, type, status, onFilter }: Props) {
	const { t } = useTranslation('absences');
	const [cancelling, setCancelling] = useState<Absence | null>(null);
	const list = useInfiniteQuery(
		absencesQuery({
			scope: 'mine',
			...yearSpan(year),
			type: type && [type],
			status: status && [status]
		})
	);
	const absences = list.data?.pages.flatMap((part) => part.items) ?? [];
	const filtered = type !== undefined || status !== undefined;

	const rows = () => {
		if (list.isPending) return <Loading rows={4} />;
		if (list.isError) return <LoadError error={list.error} onRetry={() => void list.refetch()} />;
		if (absences.length === 0) {
			return (
				<EmptyState
					title={t(filtered ? 'list.emptyFiltered' : 'list.empty', { year })}
					action={
						filtered && (
							<Button
								variant="secondary"
								onPress={() => onFilter({ type: undefined, status: undefined })}
							>
								{t('list.resetFilter')}
							</Button>
						)
					}
				/>
			);
		}
		return (
			<>
				<div className={page.scroll}>
					<Table label={t('list.label', { year })}>
						<thead>
							<tr>
								<th scope="col">{t('list.type')}</th>
								<th scope="col">{t('list.period')}</th>
								<th scope="col" data-numeric>
									{t('list.vacationDays')}
								</th>
								<th scope="col" data-numeric>
									{t('list.targetTime')}
								</th>
								<th scope="col">{t('list.status')}</th>
								<th scope="col">
									<VisuallyHidden>{t('list.actions')}</VisuallyHidden>
								</th>
							</tr>
						</thead>
						<tbody>
							{absences.map((absence) => (
								<AbsenceRow
									key={absence.id}
									absence={absence}
									onCancel={() => setCancelling(absence)}
								/>
							))}
						</tbody>
					</Table>
				</div>
				{list.hasNextPage && (
					<div>
						<Button
							variant="secondary"
							isPending={list.isFetchingNextPage}
							onPress={() => void list.fetchNextPage()}
						>
							{t('list.more')}
						</Button>
					</div>
				)}
			</>
		);
	};

	return (
		<section aria-labelledby="own-absences" className={page.section}>
			<h2 id="own-absences">{t('list.title')}</h2>
			<div className={page.filters}>
				<PeriodStepper
					label={t('list.year')}
					previousLabel={t('list.prevYear')}
					nextLabel={t('list.nextYear')}
					onPrevious={() => onFilter({ year: year - 1 })}
					onNext={() => onFilter({ year: year + 1 })}
				>
					<span className={styles.year}>{year}</span>
				</PeriodStepper>
				<SelectField
					label={t('list.type')}
					value={type ?? ''}
					onChange={(next) => onFilter({ type: absenceTypes.find((option) => option === next) })}
				>
					<option value="">{t('list.all')}</option>
					{absenceTypes.map((option) => (
						<option key={option} value={option}>
							{t(`type.${option}`)}
						</option>
					))}
				</SelectField>
				<SelectField
					label={t('list.status')}
					value={status ?? ''}
					onChange={(next) =>
						onFilter({ status: absenceStatuses.find((option) => option === next) })
					}
				>
					<option value="">{t('list.all')}</option>
					{absenceStatuses.map((option) => (
						<option key={option} value={option}>
							{t(`status.${option}`)}
						</option>
					))}
				</SelectField>
			</div>
			{rows()}
			<CancelDialog absence={cancelling} onClose={() => setCancelling(null)} />
		</section>
	);
}

type RowProps = {
	absence: Absence;
	onCancel: () => void;
};

function AbsenceRow({ absence, onCancel }: RowProps) {
	const { t, i18n } = useTranslation(['absences', 'common']);
	const lng = i18n.language;
	const queryClient = useQueryClient();
	const withdraw = useMutation({
		mutationFn: () => withdrawAbsence(absence.id),
		onSuccess: () => refreshAbsences(queryClient)
	});

	const sick = absence.type === 'sick';
	// sick leave is not taken back by the employee, and past leave cannot be undone anymore
	const cancellable = absence.status === 'approved' && !sick && absence.endDate >= todayIso();

	return (
		<tr>
			<td>
				<TypeTag type={absence.type} />
			</td>
			<td className={styles.period}>
				<span className={styles.dates}>
					{formatPeriod(absence.startDate, absence.endDate, lng)}
				</span>{' '}
				<HalfDays absence={absence} className={styles.half} />
				{absence.note && <p className={styles.note}>{absence.note}</p>}
				{absence.decisionNote && (
					<p className={styles.note}>
						<span className={styles.noteLabel}>{t('list.decisionNote')}</span>{' '}
						{absence.decisionNote}
					</p>
				)}
			</td>
			<td data-numeric>
				{absence.type === 'vacation' ? formatDays(absence.vacationDays, lng) : '–'}
			</td>
			<td data-numeric>{formatMinutes(absence.targetMinutes)}</td>
			<td>
				<span className={styles.tags}>
					<StatusTag absence={absence} />
					{sick && <SickNoteTag absence={absence} />}
				</span>
				{absence.decidedBy && absence.decidedAt && (
					<span className={styles.decided}>
						{t('list.decidedBy', {
							name: absence.decidedBy.displayName,
							date: formatInstant(absence.decidedAt, lng, { dateStyle: 'medium' })
						})}
					</span>
				)}
			</td>
			<td className={styles.actions}>
				{absence.status === 'pending' && (
					<Button variant="quiet" isPending={withdraw.isPending} onPress={() => withdraw.mutate()}>
						{t('list.withdraw')}
					</Button>
				)}
				{cancellable && (
					<Button variant="quiet" onPress={onCancel}>
						{t('list.cancel')}
					</Button>
				)}
				{withdraw.error && (
					<p role="alert" className={styles.rowError}>
						{hasCode(withdraw.error, 'INVALID_STATE')
							? t('errors.invalidState')
							: t(errorKey(withdraw.error))}
					</p>
				)}
			</td>
		</tr>
	);
}
