import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
	createWorkModelSchema,
	weekdays,
	type CreateWorkModelInput,
	type WorkModel
} from '@zeit/shared';
import { useForm, useWatch } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { z } from 'zod';
import { Button } from '../../../components/ui/button';
import { FormField } from '../../../components/ui/field';
import { Notice } from '../../../components/ui/notice';
import { i18n } from '../../../i18n';
import { formatMinutes } from '../../../i18n/format';
import { createWorkModel, updateWorkModel } from '../api';
import { durationText, optionalDurationField, parseDuration } from '../duration';
import { useErrorText } from '../error-text';
import styles from '../ui/page.module.css';
import css from './work-model-form.module.css';

const range = { error: () => i18n.t('hr:workModels.dayRange') };
// an empty day is a day off, nobody wants to type 0:00 for the weekend
const day = optionalDurationField
	.transform((minutes) => minutes ?? 0)
	.pipe(z.int().min(0, range).max(600, range));

const schema = z
	.object({
		name: createWorkModelSchema.shape.name,
		mon: day,
		tue: day,
		wed: day,
		thu: day,
		fri: day,
		sat: day,
		sun: day
	})
	.transform(({ name, ...minutes }): CreateWorkModelInput => ({ name, minutes }));

type Values = z.input<typeof schema>;

const defaults = (model: WorkModel | undefined): Values => ({
	name: model?.name ?? '',
	mon: model ? durationText(model.minutes.mon) : '',
	tue: model ? durationText(model.minutes.tue) : '',
	wed: model ? durationText(model.minutes.wed) : '',
	thu: model ? durationText(model.minutes.thu) : '',
	fri: model ? durationText(model.minutes.fri) : '',
	sat: model ? durationText(model.minutes.sat) : '',
	sun: model ? durationText(model.minutes.sun) : ''
});

type Props = {
	model?: WorkModel | undefined;
	onDone: () => void;
};

export function WorkModelForm({ model, onDone }: Props) {
	const { t } = useTranslation('hr');
	const errorText = useErrorText();
	const queryClient = useQueryClient();
	const { control, handleSubmit } = useForm({
		resolver: zodResolver(schema),
		defaultValues: defaults(model)
	});
	const typed = useWatch({ control, name: [...weekdays] });
	const week = typed.reduce((sum, text) => sum + Math.max(parseDuration(text || '0') ?? 0, 0), 0);

	const save = useMutation({
		mutationFn: (input: CreateWorkModelInput) =>
			model ? updateWorkModel(model.id, input) : createWorkModel(input),
		onSuccess: async () => {
			await queryClient.invalidateQueries({ queryKey: ['work-models'] });
			onDone();
		}
	});

	return (
		<form
			className={styles.panel}
			noValidate
			aria-labelledby="work-model-form"
			onSubmit={handleSubmit((input) => save.mutate(input))}
		>
			<div>
				<h2 id="work-model-form">
					{model ? t('workModels.editTitle', { name: model.name }) : t('workModels.new')}
				</h2>
				<p className={styles.lead}>{t('workModels.formHint')}</p>
			</div>
			<div className={css.name}>
				<FormField control={control} name="name" label={t('workModels.name')} autoFocus />
			</div>
			<fieldset className={css.week}>
				<legend className={css.legend}>{t('workModels.minutes')}</legend>
				<div className={css.days}>
					{weekdays.map((weekday) => (
						<FormField
							key={weekday}
							control={control}
							name={weekday}
							label={t(`weekdayLong.${weekday}`)}
							inputMode="numeric"
						/>
					))}
				</div>
				<p className={styles.small}>
					<span className={styles.muted}>{t('workModels.weekTarget')} </span>
					<span className={styles.mono}>{formatMinutes(week)}</span>
				</p>
			</fieldset>
			{save.error && <Notice tone="error">{errorText(save.error)}</Notice>}
			<div className={styles.actions}>
				<Button type="submit" variant="primary" isPending={save.isPending}>
					{model ? t('save') : t('workModels.create')}
				</Button>
				<Button variant="quiet" onPress={onDone}>
					{t('cancel')}
				</Button>
			</div>
		</form>
	);
}
