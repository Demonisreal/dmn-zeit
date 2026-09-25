import { useInfiniteQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
	absenceStatuses,
	absenceTypes,
	type Absence,
	type AbsenceStatus,
	type AbsenceType
} from '@zeit/shared';
import { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { errorKey } from '../../app/error-key';
import { Button } from '../../components/ui/button';
import { ConfirmDialog } from '../../components/ui/confirm-dialog';
import { EmptyState } from '../../components/ui/empty-state';
import { Notice } from '../../components/ui/notice';
import { PeriodNav } from '../../components/ui/period-nav';
import { SelectField } from '../../components/ui/select-field';
import { LoadError, Loading } from '../../components/ui/states';
import { Table } from '../../components/ui/table';
import { formatDays, formatInstant, formatMinutes } from '../../i18n/format';
import { hasCode } from '../../lib/api/errors';
import { todayIso } from '../../lib/dates';
import { HalfDays, SickNoteTag, StatusTag, TypeTag } from './absence-tags';
import styles from './absence-list.module.css';
import { ownAbsencesQuery, refreshAbsences, withdrawAbsence } from './api';
import { CancelDialog } from './cancel-dialog';
import { formatPeriod } from './dates';
import page from './ui/page.module.css';

const all = 'all';

export type AbsenceListFilter = {
	year: number;
	type: AbsenceType | undefined;
	status: AbsenceStatus | undefined;
};

type Props = AbsenceListFilter & {
	onFilter: (next: Partial<AbsenceListFilter>) => void;
};

export function AbsenceList({ year, type, status, onFilter }: Props) {
	const { t, i18n } = useTranslation(['absences', 'common']);
	const queryClient = useQueryClient();
	const [cancelling, setCancelling] = useState<Absence | null>(null);
	const [withdrawing, setWithdrawing] = useState<Absence | null>(null);
	const heading = useRef<HTMLHeadingElement>(null);
	const withdraw = useMutation({
		mutationFn: withdrawAbsence,
		onSuccess: async () => {
			setWithdrawing(null);
			await refreshAbsences(queryClient);
			// the row keeps its place but loses the button that had the focus
			heading.current?.focus();
		}
	});
	const closeWithdraw = () => {
		setWithdrawing(null);
		withdraw.reset();
	};
	const list = useInfiniteQuery(ownAbsencesQuery(year, type, status));
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
				<div
					className={page.scroll}
					role="region"
					aria-label={t('list.label', { year })}
					tabIndex={0}
				>
					<Table label={t('list.label', { year })}>
						<thead>
							<tr>
								<th scope="col" data-priority="mid">
									{t('list.type')}
								</th>
								<th scope="col">{t('list.period')}</th>
								<th scope="col" data-numeric data-priority="mid">
									{t('list.vacationDays')}
								</th>
								<th scope="col" data-numeric data-priority="mid">
									{t('list.targetTime')}
								</th>
								<th scope="col">{t('list.status')}</th>
							</tr>
						</thead>
						<tbody>
							{absences.map((absence) => (
								<AbsenceRow
									key={absence.id}
									absence={absence}
									onWithdraw={() => setWithdrawing(absence)}
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
			<h2 id="own-absences" ref={heading} tabIndex={-1} className={page.anchor}>
				{t('list.title')}
			</h2>
			<div className={page.filters}>
				<PeriodNav
					label={t('list.year')}
					previous={t('list.prevYear')}
					next={t('list.nextYear')}
					onStep={(by) => onFilter({ year: year + by })}
				>
					<span className={styles.year}>{year}</span>
				</PeriodNav>
				<SelectField
					label={t('list.type')}
					options={[
						{ id: all, label: t('list.all') },
						...absenceTypes.map((option) => ({ id: option, label: t(`type.${option}`) }))
					]}
					value={type ?? all}
					onChange={(key) => onFilter({ type: absenceTypes.find((option) => option === key) })}
				/>
				<SelectField
					label={t('list.status')}
					options={[
						{ id: all, label: t('list.all') },
						...absenceStatuses.map((option) => ({ id: option, label: t(`status.${option}`) }))
					]}
					value={status ?? all}
					onChange={(key) => onFilter({ status: absenceStatuses.find((option) => option === key) })}
				/>
			</div>
			{rows()}
			<CancelDialog absence={cancelling} onClose={() => setCancelling(null)} />
			<ConfirmDialog
				isOpen={withdrawing !== null}
				onClose={closeWithdraw}
				title={t('withdraw.title')}
				confirmLabel={t('withdraw.confirm')}
				onConfirm={() => withdrawing && withdraw.mutate(withdrawing.id)}
				isPending={withdraw.isPending}
				error={
					withdraw.error && (
						<Notice tone="error">
							{hasCode(withdraw.error, 'INVALID_STATE')
								? t('errors.invalidState')
								: t(errorKey(withdraw.error))}
						</Notice>
					)
				}
			>
				{withdrawing && (
					<p>
						{t('withdraw.body', {
							type: t(`type.${withdrawing.type}`),
							period: formatPeriod(withdrawing.startDate, withdrawing.endDate, i18n.language)
						})}
					</p>
				)}
			</ConfirmDialog>
		</section>
	);
}

type RowProps = {
	absence: Absence;
	onWithdraw: () => void;
	onCancel: () => void;
};

function AbsenceRow({ absence, onWithdraw, onCancel }: RowProps) {
	const { t, i18n } = useTranslation('absences');
	const lng = i18n.language;
	const period = formatPeriod(absence.startDate, absence.endDate, lng);

	const sick = absence.type === 'sick';
	// sick leave is not taken back by the employee, and past leave cannot be undone anymore
	const cancellable = absence.status === 'approved' && !sick && absence.endDate >= todayIso();

	return (
		<tr>
			<td data-priority="mid">
				<TypeTag type={absence.type} />
			</td>
			<td className={styles.period}>
				<span className={styles.type}>
					<TypeTag type={absence.type} />
				</span>
				<span className={styles.dates}>{period}</span>{' '}
				<HalfDays absence={absence} className={styles.half} />
				{absence.type === 'vacation' && (
					<span className={styles.days}>
						{t('list.days', { days: formatDays(absence.vacationDays, lng) })}
					</span>
				)}
				{absence.note && <p className={styles.note}>{absence.note}</p>}
				{absence.decisionNote && (
					<p className={styles.note}>
						<span className={styles.noteLabel}>{t('list.decisionNote')}</span>{' '}
						{absence.decisionNote}
					</p>
				)}
			</td>
			<td data-numeric data-priority="mid">
				{absence.type === 'vacation' ? formatDays(absence.vacationDays, lng) : '–'}
			</td>
			<td data-numeric data-priority="mid">
				{formatMinutes(absence.targetMinutes)}
			</td>
			<td>
				<div className={styles.state}>
					<div>
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
					</div>
					{absence.status === 'pending' && (
						<Button
							variant="secondary"
							aria-label={t('list.withdrawLabel', { period })}
							onPress={onWithdraw}
						>
							{t('list.withdraw')}
						</Button>
					)}
					{cancellable && (
						<Button
							variant="secondary"
							aria-label={t('list.cancelLabel', { period })}
							onPress={onCancel}
						>
							{t('list.cancel')}
						</Button>
					)}
				</div>
			</td>
		</tr>
	);
}
