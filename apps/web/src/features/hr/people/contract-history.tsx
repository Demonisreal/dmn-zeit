import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { Contract, Employee, WorkModel } from '@zeit/shared';
import { useState } from 'react';
import { VisuallyHidden } from 'react-aria-components';
import { useTranslation } from 'react-i18next';
import { Button } from '../../../components/ui/button';
import { ConfirmDialog } from '../../../components/ui/confirm-dialog';
import { Notice } from '../../../components/ui/notice';
import { Table } from '../../../components/ui/table';
import { Tag } from '../../../components/ui/tag';
import { formatDate, formatDays, formatMinutes } from '../../../i18n/format';
import { todayIso } from '../../../lib/dates';
import { deleteContract } from '../api';
import { useErrorText } from '../error-text';
import styles from '../ui/page.module.css';
import { WeekdayMinutes, weekMinutes } from '../weekday-minutes';
import { contractOn } from './contract-schema';

type Props = {
	employee: Employee;
	contracts: Contract[];
	workModels: WorkModel[];
};

export function ContractHistory({ employee, contracts, workModels }: Props) {
	const { t, i18n } = useTranslation('hr');
	const errorText = useErrorText();
	const queryClient = useQueryClient();
	const [removing, setRemoving] = useState<Contract | null>(null);
	const today = todayIso();
	const current = contractOn(contracts, today);
	const modelName = new Map(workModels.map((model) => [model.id, model.name]));
	const date = (iso: string) => formatDate(iso, i18n.language);

	const remove = useMutation({
		mutationFn: (contract: Contract) => deleteContract(employee.id, contract.id),
		onSuccess: async () => {
			await queryClient.invalidateQueries({ queryKey: ['contracts', employee.id] });
			setRemoving(null);
		}
	});

	// the db only lets go of contracts that have not started and are not in a closed month
	const removable = (contract: Contract) =>
		contract.validFrom > today &&
		(employee.closedThrough === null || contract.validFrom > employee.closedThrough);

	const cap = (contract: Contract) =>
		contract.flexCapPlusMinutes === null && contract.flexCapMinusMinutes === null
			? t('contracts.capCompany')
			: t('contracts.capRange', {
					plus:
						contract.flexCapPlusMinutes === null
							? '–'
							: formatMinutes(contract.flexCapPlusMinutes, { signed: true }),
					minus:
						contract.flexCapMinusMinutes === null
							? '–'
							: formatMinutes(-contract.flexCapMinusMinutes)
				});

	return (
		<>
			<div className={styles.scroll} role="group" aria-label={t('contracts.title')} tabIndex={0}>
				<Table label={t('contracts.title')}>
					<thead>
						<tr>
							<th scope="col">{t('contracts.validFrom')}</th>
							<th scope="col" data-priority="mid">
								{t('contracts.workModel')}
							</th>
							<th scope="col" data-numeric>
								{t('contracts.weekTarget')}
							</th>
							<th scope="col" data-priority="wide">
								{t('contracts.days')}
							</th>
							<th scope="col" data-numeric data-priority="mid">
								{t('contracts.vacationDaysYear')}
							</th>
							<th scope="col" data-numeric data-priority="wide">
								{t('contracts.basisDays')}
							</th>
							<th scope="col" data-priority="wide">
								{t('contracts.cap')}
							</th>
							<th scope="col">
								<VisuallyHidden>{t('actions')}</VisuallyHidden>
							</th>
						</tr>
					</thead>
					<tbody>
						{contracts
							.toSorted((a, b) => b.validFrom.localeCompare(a.validFrom))
							.map((contract) => (
								<tr key={contract.id} data-current={contract === current || undefined}>
									<td className={styles.mono}>
										{date(contract.validFrom)}{' '}
										{contract === current && <Tag>{t('contracts.current')}</Tag>}
										{contract.validFrom > today && <Tag>{t('contracts.future')}</Tag>}
									</td>
									<td data-priority="mid">{modelName.get(contract.workModelId) ?? '–'}</td>
									<td data-numeric>{formatMinutes(weekMinutes(contract.minutes))}</td>
									<td data-priority="wide">
										<WeekdayMinutes minutes={contract.minutes} />
									</td>
									<td data-numeric data-priority="mid">
										{formatDays(contract.vacationDaysYear, i18n.language)}
									</td>
									<td data-numeric data-priority="wide">
										{contract.vacationBasisDays}
									</td>
									<td className={styles.small} data-priority="wide">
										{cap(contract)}
									</td>
									<td>
										{removable(contract) && (
											<div className={styles.rowActions}>
												<Button
													variant="quiet"
													aria-label={t('contracts.deleteTitle', {
														date: date(contract.validFrom)
													})}
													onPress={() => setRemoving(contract)}
												>
													{t('contracts.delete')}
												</Button>
											</div>
										)}
									</td>
								</tr>
							))}
					</tbody>
				</Table>
			</div>
			<ConfirmDialog
				isOpen={removing !== null}
				onClose={() => {
					setRemoving(null);
					remove.reset();
				}}
				title={t('contracts.deleteTitle', { date: removing ? date(removing.validFrom) : '' })}
				confirmLabel={t('contracts.delete')}
				onConfirm={() => removing && remove.mutate(removing)}
				isPending={remove.isPending}
				error={remove.error && <Notice tone="error">{errorText(remove.error)}</Notice>}
			>
				<p>{t('contracts.deleteText')}</p>
			</ConfirmDialog>
		</>
	);
}
