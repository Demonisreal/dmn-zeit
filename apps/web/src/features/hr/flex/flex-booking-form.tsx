import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
	createFlexBookingSchema,
	flexBookingTypes,
	type CreateFlexBookingInput
} from '@zeit/shared';
import { useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { z } from 'zod';
import { Button } from '../../../components/ui/button';
import { FormField, FormTextArea } from '../../../components/ui/field';
import { Notice } from '../../../components/ui/notice';
import { FormSelect } from '../../../components/ui/select-field';
import { todayIso } from '../../../lib/dates';
import { bookFlex } from '../api';
import { durationField } from '../duration';
import { useErrorText } from '../error-text';
import { FormDate } from '../ui/date-field';
import styles from '../ui/page.module.css';

const fields = createFlexBookingSchema.shape;

const schema = z
	.object({
		type: fields.type,
		minutes: durationField,
		effectiveDate: fields.effectiveDate,
		reason: fields.reason
	})
	.pipe(createFlexBookingSchema);

type Props = {
	employeeId: string;
	onDone: () => void;
};

export function FlexBookingForm({ employeeId, onDone }: Props) {
	const { t } = useTranslation('hr');
	const errorText = useErrorText();
	const queryClient = useQueryClient();
	const { control, handleSubmit } = useForm({
		resolver: zodResolver(schema),
		defaultValues: { type: 'manual' as const, minutes: '', effectiveDate: todayIso(), reason: '' }
	});

	const save = useMutation({
		mutationFn: (input: CreateFlexBookingInput) => bookFlex(employeeId, input),
		onSuccess: async () => {
			await queryClient.invalidateQueries({ queryKey: ['flex', employeeId] });
			onDone();
		}
	});

	return (
		<form
			className={styles.panel}
			noValidate
			aria-labelledby="flex-booking"
			onSubmit={handleSubmit((input) => save.mutate(input))}
		>
			<div>
				<h2 id="flex-booking">{t('flex.new')}</h2>
				<p className={styles.lead}>{t('flex.newHint')}</p>
			</div>
			<div className={styles.fields}>
				<FormSelect
					control={control}
					name="type"
					label={t('flex.type')}
					autoFocus
					options={flexBookingTypes
						.filter((type) => type !== 'cap_forfeit')
						.map((type) => ({ id: type, label: t(`flex.types.${type}`) }))}
				/>
				<FormField
					control={control}
					name="minutes"
					label={t('flex.minutes')}
					description={t('flex.minutesHint')}
				/>
				<FormDate control={control} name="effectiveDate" label={t('flex.effectiveDate')} />
				<div className={styles.wide}>
					<FormTextArea control={control} name="reason" label={t('flex.reason')} />
				</div>
			</div>
			{save.error && <Notice tone="error">{errorText(save.error)}</Notice>}
			<div className={styles.actions}>
				<Button type="submit" variant="primary" isPending={save.isPending}>
					{t('flex.book')}
				</Button>
				<Button variant="quiet" onPress={onDone}>
					{t('cancel')}
				</Button>
			</div>
		</form>
	);
}
