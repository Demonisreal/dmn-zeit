import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { Rate } from '@zeit/shared';
import { useId, useState } from 'react';
import { VisuallyHidden } from 'react-aria-components';
import { useTranslation } from 'react-i18next';
import { Button } from '../../components/ui/button';
import { ConfirmDialog } from '../../components/ui/confirm-dialog';
import { EmptyState } from '../../components/ui/empty-state';
import { Notice } from '../../components/ui/notice';
import { Loading, LoadError } from '../../components/ui/states';
import { Table } from '../../components/ui/table';
import { Tag } from '../../components/ui/tag';
import { issueText } from '../../i18n';
import { formatCents, formatDate } from '../../i18n/format';
import { hasCode } from '../../lib/api/errors';
import { todayIso } from '../../lib/dates';
import { employeesQuery } from '../hr/api';
import { useErrorText } from '../hr/error-text';
import { fullName } from '../hr/people/employee-options';
import styles from '../hr/ui/page.module.css';
import { ratesQuery, removeRate } from './api';
import { RateForm } from './rate-form';
import { own, queryScope, type RatesScope } from './rates-scope';
import css from './rates-table.module.css';

// the rate took effect between loading and deleting, the api names the rule in the details
const tookEffect = (err: unknown) =>
	hasCode(err, 'INVALID_STATE') &&
	!Array.isArray(err.details) &&
	err.details?.message === 'rate.futureOnly';

type Props = {
	scope: RatesScope;
	solo: boolean;
};

export function RatesTable({ scope, solo }: Props) {
	const { t, i18n } = useTranslation('billing');
	const errorText = useErrorText();
	const queryClient = useQueryClient();
	const titleId = useId();
	const [adding, setAdding] = useState(false);
	const [closed, setClosed] = useState(false);
	const [removing, setRemoving] = useState<Rate | null>(null);
	const rates = useQuery(ratesQuery(queryScope(scope)));
	const perPerson = !solo && scope.kind !== 'default';
	const employees = useQuery({ ...employeesQuery(true), enabled: perPerson });
	const today = todayIso();
	const lng = i18n.language;
	const date = (iso: string) => formatDate(iso, lng);

	const remove = useMutation({
		mutationFn: (rate: Rate) => removeRate(rate.id),
		onSuccess: async () => {
			await queryClient.invalidateQueries({ queryKey: ['rates'] });
			setRemoving(null);
		}
	});

	const taskName = new Map(
		scope.kind === 'project' ? scope.tasks.map((task) => [task.id, task.name]) : []
	);
	const personName = new Map(employees.data?.map((employee) => [employee.id, fullName(employee)]));
	const keyOf = (rate: Rate) => `${rate.taskId ?? ''}|${rate.employeeId ?? ''}`;
	const levelOf = (rate: Rate) =>
		rate.taskId
			? t('rates.levels.task', { name: taskName.get(rate.taskId) ?? '' })
			: t('rates.levels.project');
	const personOf = (rate: Rate) =>
		rate.employeeId ? (personName.get(rate.employeeId) ?? '') : t('rates.everyone');

	const shown = (rates.data ?? [])
		.filter(own(scope))
		.toSorted(
			(a, b) =>
				Number(a.taskId !== null) - Number(b.taskId !== null) ||
				levelOf(a).localeCompare(levelOf(b), lng) ||
				Number(a.employeeId !== null) - Number(b.employeeId !== null) ||
				personOf(a).localeCompare(personOf(b), lng) ||
				b.validFrom.localeCompare(a.validFrom)
		);

	// per level and person the latest rate that has started is the one in force today
	const current = new Map<string, Rate>();
	for (const rate of shown) {
		if (rate.validFrom <= today && !current.has(keyOf(rate))) current.set(keyOf(rate), rate);
	}

	let body;
	if (rates.isError) {
		body = <LoadError error={rates.error} onRetry={() => void rates.refetch()} />;
	} else if (!rates.data) {
		body = <Loading rows={2} />;
	} else if (shown.length === 0) {
		body = <EmptyState title={t(`rates.empty.${scope.kind}`)} />;
	} else {
		body = (
			<div className={styles.scroll} role="group" aria-labelledby={titleId} tabIndex={0}>
				<Table label={t(scope.kind === 'default' ? 'rates.defaultTitle' : 'rates.title')}>
					<thead>
						<tr>
							<th scope="col">{t('rates.validFrom')}</th>
							{scope.kind === 'project' && <th scope="col">{t('rates.level')}</th>}
							{perPerson && <th scope="col">{t('rates.person')}</th>}
							<th scope="col" data-numeric>
								{t('rates.perHour')}
							</th>
							<th scope="col">
								<VisuallyHidden>{t('actions')}</VisuallyHidden>
							</th>
						</tr>
					</thead>
					<tbody>
						{shown.map((rate) => (
							<tr key={rate.id} data-current={current.get(keyOf(rate)) === rate || undefined}>
								<td className={styles.mono}>
									{date(rate.validFrom)}{' '}
									{current.get(keyOf(rate)) === rate && <Tag>{t('rates.current')}</Tag>}
									{rate.validFrom > today && <Tag>{t('rates.future')}</Tag>}
								</td>
								{scope.kind === 'project' && <td className={css.level}>{levelOf(rate)}</td>}
								{perPerson && <td>{personOf(rate)}</td>}
								<td data-numeric>{formatCents(rate.rateCents, lng)}</td>
								<td>
									{rate.validFrom > today && (
										<div className={styles.rowActions}>
											<Button
												variant="quiet"
												aria-label={t('rates.deleteTitle', { date: date(rate.validFrom) })}
												onPress={() => setRemoving(rate)}
											>
												{t('rates.delete')}
											</Button>
										</div>
									)}
								</td>
							</tr>
						))}
					</tbody>
				</Table>
			</div>
		);
	}

	return (
		<section className={styles.section} aria-labelledby={titleId}>
			<div className={styles.sectionHead}>
				<div>
					<h2 id={titleId}>{t(scope.kind === 'default' ? 'rates.defaultTitle' : 'rates.title')}</h2>
					<p className={styles.lead}>{t(`rates.lead.${scope.kind}`)}</p>
				</div>
				{!adding && (
					<Button variant="secondary" autoFocus={closed} onPress={() => setAdding(true)}>
						{t('rates.new')}
					</Button>
				)}
			</div>
			{adding && (
				<RateForm
					scope={scope}
					employees={perPerson ? (employees.data ?? []) : null}
					onDone={() => {
						setAdding(false);
						setClosed(true);
					}}
				/>
			)}
			{body}
			<ConfirmDialog
				isOpen={removing !== null}
				onClose={() => {
					setRemoving(null);
					remove.reset();
				}}
				title={t('rates.deleteTitle', { date: removing ? date(removing.validFrom) : '' })}
				confirmLabel={t('rates.delete')}
				onConfirm={() => removing && remove.mutate(removing)}
				isPending={remove.isPending}
				error={
					remove.error && (
						<Notice tone="error">
							{tookEffect(remove.error) ? issueText('rate.futureOnly') : errorText(remove.error)}
						</Notice>
					)
				}
			>
				<p>{t('rates.deleteText')}</p>
			</ConfirmDialog>
		</section>
	);
}
