import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { absenceTypes, isoDateSchema, noteSchema, type AbsenceType } from '@zeit/shared';
import { useController, useForm, useWatch } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { z } from 'zod';
import { errorKey } from '../../app/error-key';
import { Button } from '../../components/ui/button';
import field from '../../components/ui/field.module.css';
import { Notice } from '../../components/ui/notice';
import { issueText } from '../../i18n';
import { hasCode } from '../../lib/api/errors';
import { AbsencePreview } from './absence-preview';
import { createAbsence, refreshAbsences, type PreviewInput } from './api';
import { DateRangeField } from './date-range-field';
import { formatPeriod } from './dates';
import styles from './absence-form.module.css';
import { TextAreaField } from './ui/text-area-field';

const formSchema = z.object({
	type: z.enum(absenceTypes),
	startDate: isoDateSchema,
	endDate: isoDateSchema,
	halfDayStart: z.boolean(),
	halfDayEnd: z.boolean(),
	// an empty textarea means no note, the api refuses an empty string
	note: z
		.string()
		.transform((raw) => raw.trim() || undefined)
		.pipe(noteSchema.optional())
});

const fields = ['type', 'startDate', 'endDate', 'halfDayStart', 'halfDayEnd', 'note'] as const;
type FieldName = (typeof fields)[number];
const isField = (name: string): name is FieldName => (fields as readonly string[]).includes(name);

const typeOrder: AbsenceType[] = ['vacation', 'time_off', 'sick'];

type Props = {
	employeeId: string;
	start: string | undefined;
	onClose: () => void;
	onCreated: (message: string) => void;
};

export function AbsenceForm({ employeeId, start, onClose, onCreated }: Props) {
	const { t, i18n } = useTranslation(['absences', 'common']);
	const queryClient = useQueryClient();
	const {
		control,
		register,
		handleSubmit,
		setValue,
		setError,
		formState: { errors }
	} = useForm<z.input<typeof formSchema>, unknown, z.output<typeof formSchema>>({
		resolver: zodResolver(formSchema),
		defaultValues: {
			type: 'vacation',
			startDate: start ?? '',
			endDate: start ?? '',
			halfDayStart: false,
			halfDayEnd: false,
			note: ''
		}
	});
	const draft = useWatch({ control });
	const startDate = useController({ control, name: 'startDate' });
	const endDate = useController({ control, name: 'endDate' });

	const create = useMutation({
		mutationFn: createAbsence,
		onSuccess: async (_, input) => {
			await refreshAbsences(queryClient);
			const period = formatPeriod(input.startDate, input.endDate, i18n.language);
			onCreated(t(input.type === 'sick' ? 'form.reported' : 'form.created', { period }));
		},
		onError: (err) => {
			if (!hasCode(err, 'VALIDATION') || !Array.isArray(err.details)) return;
			for (const issue of err.details) {
				if (isField(issue.field)) {
					setError(issue.field, { message: issueText(issue.message, issue.params) });
				}
			}
		}
	});

	const failure = (err: Error) => {
		if (hasCode(err, 'TIME_OVERLAP')) return t('errors.overlap');
		if (hasCode(err, 'PERIOD_LOCKED')) return t('errors.locked');
		if (hasCode(err, 'VALIDATION')) return t('errors.validation');
		return t(errorKey(err));
	};

	const message = (text: string | undefined) => (text === undefined ? undefined : issueText(text));
	const single = Boolean(draft.startDate) && draft.startDate === draft.endDate;
	const preview: PreviewInput | null =
		draft.startDate && draft.endDate
			? {
					employeeId,
					type: draft.type ?? 'vacation',
					startDate: draft.startDate,
					endDate: draft.endDate,
					halfDayStart: draft.halfDayStart ?? false,
					halfDayEnd: !single && (draft.halfDayEnd ?? false)
				}
			: null;
	const rangeError = startDate.fieldState.error ?? endDate.fieldState.error;

	return (
		<section id="absence-form" aria-labelledby="absence-form-title" className={styles.panel}>
			<h2 id="absence-form-title">{t('form.title')}</h2>
			<div className={styles.layout}>
				<form
					noValidate
					className={styles.form}
					onSubmit={handleSubmit((values) => create.mutate({ employeeId, ...values }))}
				>
					<fieldset className={styles.group}>
						<legend className={field.label}>{t('form.type')}</legend>
						<div className={styles.segments}>
							{typeOrder.map((type) => (
								<label key={type} className={styles.segment}>
									<input
										type="radio"
										value={type}
										className={styles.radio}
										autoFocus={type === 'vacation'}
										{...register('type')}
									/>
									{t(`type.${type}`)}
								</label>
							))}
						</div>
						{draft.type === 'sick' && <p className={field.description}>{t('form.sickHint')}</p>}
					</fieldset>

					<DateRangeField
						label={t('form.period')}
						start={startDate.field.value}
						end={endDate.field.value}
						onChange={(from, to) => {
							startDate.field.onChange(from);
							endDate.field.onChange(to);
							// on a single day there is only one half, the api refuses both flags
							if (from === to) setValue('halfDayEnd', false);
						}}
						error={message(rangeError?.message)}
					/>

					<fieldset className={styles.group}>
						<legend className={field.label}>{t('form.halfDays')}</legend>
						<div className={styles.checks}>
							<label className={styles.check}>
								<input type="checkbox" {...register('halfDayStart')} />
								{t(single ? 'form.halfDay' : 'form.halfDayStart')}
							</label>
							{!single && (
								<label className={styles.check}>
									<input type="checkbox" {...register('halfDayEnd')} />
									{t('form.halfDayEnd')}
								</label>
							)}
						</div>
					</fieldset>

					<TextAreaField
						label={t('form.note')}
						description={t('form.noteHint')}
						error={message(errors.note?.message)}
						{...register('note')}
					/>

					{create.error && <Notice tone="error">{failure(create.error)}</Notice>}
					<div className={styles.actions}>
						<Button type="submit" variant="primary" isPending={create.isPending}>
							{t(draft.type === 'sick' ? 'form.submitSick' : 'form.submit')}
						</Button>
						<Button variant="quiet" onPress={onClose}>
							{t('form.close')}
						</Button>
					</div>
				</form>
				<AbsencePreview input={preview} />
			</div>
		</section>
	);
}
