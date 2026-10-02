import { useQuery } from '@tanstack/react-query';
import type { ProjectWeekCell, ProjectWeekRow } from '@zeit/shared';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { errorKey } from '../../app/error-key';
import { Button } from '../../components/ui/button';
import { ConfirmDialog } from '../../components/ui/confirm-dialog';
import { Notice } from '../../components/ui/notice';
import { Tag } from '../../components/ui/tag';
import { formatCents, formatMinutes, formatTime } from '../../i18n/format';
import { hasCode } from '../../lib/api/errors';
import detail from '../week/day-detail.module.css';
import { addDays, mondayOf } from '../week/dates';
import { minutesSince, useNow } from '../week/use-now';
import { bookableQuery, projectEntriesQuery, useProjectMutation, voidEntry } from './api';
import styles from './cell-detail.module.css';
import { EntryForm } from './entry-form';
import { valuesOf } from './entry-schema';
import { useExplain } from './explain';
import { slotKey } from './project-picker';

type Props = {
	cell: ProjectWeekCell;
	row: ProjectWeekRow;
	employeeId: string;
	own: boolean;
	withAmount: boolean;
};

type Stroke = ProjectWeekCell['derivation']['entries'][number];

export function CellDetail({ cell, row, employeeId, own, withAmount }: Props) {
	const { t, i18n } = useTranslation(['projects', 'week', 'common']);
	const lng = i18n.language;
	const explain = useExplain();
	const monday = mondayOf(cell.date);
	const entries = useQuery(projectEntriesQuery(employeeId, monday, addDays(monday, 6)));
	const bookable = useQuery({ ...bookableQuery, enabled: own });
	const running = cell.derivation.entries.some((entry) => entry.endedAt === null);
	const now = useNow(running);
	const [form, setForm] = useState<string | null>(null);
	const [striking, setStriking] = useState<Stroke | null>(null);
	const [done, setDone] = useState<'added' | 'changed' | 'voided' | null>(null);
	const strike = useProjectMutation(voidEntry);
	const editable = own && cell.lock === 'none';
	const noteOf = (id: string) => entries.data?.items.find((entry) => entry.id === id)?.note ?? null;
	const span = (entry: Stroke) =>
		entry.endedAt
			? t('week:detail.span', {
					from: formatTime(entry.startedAt, lng),
					to: formatTime(entry.endedAt, lng)
				})
			: t('week:detail.since', { from: formatTime(entry.startedAt, lng) });
	const slot = { projectId: row.project.id, taskId: row.task?.id ?? null };
	const editing = cell.derivation.entries.find((entry) => entry.id === form);
	const { rate } = cell.derivation;
	const money = withAmount && cell.amountCents !== null;

	return (
		<div className={detail.detail}>
			<section className={detail.block}>
				<h3>{t('detail.entries')}</h3>
				<ol className={detail.timeline}>
					{cell.derivation.entries.map((entry) => {
						const note = noteOf(entry.id);
						return (
							<li key={entry.id}>
								<span className={detail.mono}>{span(entry)}</span>
								{!entry.endedAt && <span className={detail.running}>{t('week:row.running')}</span>}
								<span className={detail.amount}>
									{formatMinutes(
										entry.endedAt
											? Math.round(
													(Date.parse(entry.endedAt) - Date.parse(entry.startedAt)) / 60_000
												)
											: minutesSince(Date.parse(entry.startedAt), now)
									)}
								</span>
								{note && <span className={detail.hint}>{note}</span>}
								{editable && entry.endedAt && (
									<span className={styles.actions}>
										<Button variant="quiet" onPress={() => setForm(entry.id)}>
											{t('detail.edit')}
										</Button>
										<Button variant="quiet" onPress={() => setStriking(entry)}>
											{t('detail.void')}
										</Button>
									</span>
								)}
							</li>
						);
					})}
				</ol>
			</section>

			<section className={detail.block}>
				<h3>{t('week:detail.calc')}</h3>
				<dl className={detail.calc}>
					<div>
						<dt>
							<span aria-hidden="true" />
							{t('detail.raw')}
						</dt>
						<dd>
							<span className={detail.amount}>{formatMinutes(cell.rawMinutes)}</span>
							<span className={detail.hint}>{t('detail.rawHint')}</span>
						</dd>
					</div>
					<div className={money ? undefined : detail.result}>
						<dt>
							<span aria-hidden="true">{money ? '' : '='}</span>
							{t('detail.rounded')}
						</dt>
						<dd>
							<span className={detail.amount}>{formatMinutes(cell.roundedMinutes)}</span>
							<span className={detail.hint}>{explain(cell.derivation.rounding)}</span>
						</dd>
					</div>
					{money && rate && (
						<div>
							<dt>
								<span aria-hidden="true">×</span>
								{t('detail.rate')}
							</dt>
							<dd>
								<span className={detail.amount}>{formatCents(rate.cents, lng)}</span>
								<span className={detail.hint}>{explain(rate.explanation)}</span>
							</dd>
						</div>
					)}
					{money && (
						<div className={detail.result}>
							<dt>
								<span aria-hidden="true">=</span>
								{t('detail.amount')}
							</dt>
							<dd>
								<span className={detail.amount}>{formatCents(cell.amountCents!, lng)}</span>
							</dd>
						</div>
					)}
				</dl>
				{(!cell.billable || cell.lock !== 'none') && (
					<p className={`${detail.line} ${styles.state}`}>
						{!cell.billable && <Tag>{t('detail.notBillable')}</Tag>}
						{cell.lock !== 'none' && <span>{t(`detail.lock.${cell.lock}`)}</span>}
					</p>
				)}
			</section>

			{editable && (
				<div className={`${detail.wide} ${styles.more}`}>
					{done && <Notice tone="success">{t(`detail.done.${done}`)}</Notice>}
					{form !== null && bookable.data ? (
						<EntryForm
							key={form}
							projects={bookable.data}
							initial={
								editing
									? valuesOf({ ...slot, ...editing, note: noteOf(editing.id) })
									: { slot: slotKey(slot), date: cell.date, start: '', end: '', note: '' }
							}
							entryId={editing?.id}
							title={t(editing ? 'entry.editTitle' : 'entry.title')}
							onDone={() => {
								setDone(editing ? 'changed' : 'added');
								setForm(null);
							}}
							onCancel={() => setForm(null)}
						/>
					) : (
						<div>
							<Button variant="secondary" onPress={() => setForm('add')}>
								{t('detail.add')}
							</Button>
						</div>
					)}
				</div>
			)}

			<ConfirmDialog
				isOpen={striking !== null}
				onClose={() => setStriking(null)}
				title={t('entry.voidTitle')}
				confirmLabel={t('entry.voidConfirm')}
				isPending={strike.isPending}
				onConfirm={() =>
					striking &&
					strike.mutate(striking.id, {
						onSuccess: () => {
							setStriking(null);
							setDone('voided');
						}
					})
				}
				error={
					strike.error && (
						<Notice tone="error">
							{hasCode(strike.error, 'INVOICED') ? t('entry.invoiced') : t(errorKey(strike.error))}
						</Notice>
					)
				}
			>
				<p>
					{striking &&
						t('entry.voidText', {
							span: span(striking),
							project: row.task ? `${row.project.name} · ${row.task.name}` : row.project.name
						})}
				</p>
			</ConfirmDialog>
		</div>
	);
}
