import type { WorkModel } from '@zeit/shared';
import { useWatch, type Control, type FieldPath, type FieldValues } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { FormField } from '../../../components/ui/field';
import { FormSelect } from '../../../components/ui/select-field';
import styles from '../ui/page.module.css';
import { WeekdayMinutes } from '../weekday-minutes';
import { basisDayOptions, type ContractValues } from './contract-schema';

type Values = Omit<ContractValues, 'validFrom'>;

type Props<T extends FieldValues, TOut> = {
	control: Control<T, unknown, TOut>;
	workModels: WorkModel[];
};

export function ContractFields<T extends Values, TOut>({ control, workModels }: Props<T, TOut>) {
	const { t } = useTranslation('hr');
	const at = (name: keyof Values) => name as FieldPath<T>;
	const modelId = useWatch({ control, name: at('workModelId') }) as string;
	const model = workModels.find((candidate) => candidate.id === modelId);

	return (
		<>
			<FormSelect
				control={control}
				name={at('workModelId')}
				label={t('contracts.workModel')}
				placeholder={t('choose')}
				options={workModels
					.filter((candidate) => candidate.archivedAt === null)
					.map((candidate) => ({ id: candidate.id, label: candidate.name }))}
			/>
			<FormField
				control={control}
				name={at('vacationDaysYear')}
				label={t('contracts.vacationDaysYear')}
				inputMode="decimal"
				description={t('contracts.vacationDaysHint')}
			/>
			<FormSelect
				control={control}
				name={at('vacationBasisDays')}
				label={t('contracts.basisDays')}
				options={basisDayOptions}
				description={t('contracts.basisDaysHint')}
			/>
			<FormField
				control={control}
				name={at('flexCapPlusMinutes')}
				label={t('contracts.capPlus')}
				description={t('contracts.capHint')}
			/>
			<FormField
				control={control}
				name={at('flexCapMinusMinutes')}
				label={t('contracts.capMinus')}
				description={t('contracts.capHint')}
			/>
			{model && (
				<p className={`${styles.wide} ${styles.small}`}>
					<span className={styles.muted}>{t('contracts.modelTarget')} </span>
					<WeekdayMinutes minutes={model.minutes} />
				</p>
			)}
		</>
	);
}
