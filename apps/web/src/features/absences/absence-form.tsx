import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { absenceTypes, isoDateSchema, noteSchema, type AbsenceType } from '@zeit/shared';
import { Label, Radio, RadioGroup } from 'react-aria-components';
import { useController, useForm, useWatch } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { z } from 'zod';
import { errorKey } from '../../app/error-key';
import { Button } from '../../components/ui/button';
import { Checkbox } from '../../components/ui/checkbox';
import { FormTextArea } from '../../components/ui/field';
import field from '../../components/ui/field.module.css';
import { Notice } from '../../components/ui/notice';
import { issueText } from '../../i18n';
import { hasCode } from '../../lib/api/errors';
import { AbsencePreview } from './absence-preview';
import { createAbsence, refreshAbsences, type PreviewInput } from './api';
import { DateRangeField } from './date-range-field';
import { formatPeriod } from './dates';
import css from './absence-form.module.css';

const fieldStyles = field as Record<'label' | 'description', string>;
const styles = css as Record<
	'panel' | 'layout' | 'form' | 'group' | 'segments' | 'segment' | 'checks' | 'actions',
	string
>;

const formSchema = z.object({
	type: z.enum(absenceTypes),
	startDate: isoDateSchema,
	endDate: isoDateSchema,
	halfDayStart: z.boolean(),
	halfDayEnd: z.boolean(),
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
	const { control, handleSubmit, setValue, setError } = useForm<
		z.input<typeof formSchema>,
		unknown,
		z.output<typeof formSchema>
	>({
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
	const type = useController({ control, name: 'type' });
	const startDate = useController({ control, name: 'startDate' });
	const endDate = useController({ control, name: 'endDate' });
	const halfDayStart = useController({ control, name: 'halfDayStart' });
	const halfDayEnd = useController({ control, name: 'halfDayEnd' });

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
					<RadioGroup
						value={type.field.value}
						onChange={type.field.onChange}
						orientation="horizontal"
						{...(draft.type === 'sick' && { 'aria-describedby': 'absence-sick-hint' })}
						className={styles.group}
					>
						<Label className={fieldStyles.label}>{t('form.type')}</Label>
						<div className={styles.segments}>
							{typeOrder.map((option) => (
								<Radio
									key={option}
									value={option}
									autoFocus={option === 'vacation'}
									className={styles.segment}
								>
									{t(`type.${option}`)}
								</Radio>
							))}
						</div>
						{draft.type === 'sick' && (
							<p id="absence-sick-hint" className={fieldStyles.description}>
								{t('form.sickHint')}
							</p>
						)}
					</RadioGroup>

					<DateRangeField
						label={t('form.period')}
						start={startDate.field.value}
						end={endDate.field.value}
						onChange={(from, to) => {
							startDate.field.onChange(from);
							endDate.field.onChange(to);
							if (from === to) setValue('halfDayEnd', false);
						}}
						error={message(rangeError?.message)}
					/>

					<fieldset className={styles.group}>
						<legend className={fieldStyles.label}>{t('form.halfDays')}</legend>
						<div className={styles.checks}>
							<Checkbox
								isSelected={halfDayStart.field.value}
								onChange={halfDayStart.field.onChange}
							>
								{t(single ? 'form.halfDay' : 'form.halfDayStart')}
							</Checkbox>
							{!single && (
								<Checkbox isSelected={halfDayEnd.field.value} onChange={halfDayEnd.field.onChange}>
									{t('form.halfDayEnd')}
								</Checkbox>
							)}
						</div>
					</fieldset>

					<FormTextArea
						control={control}
						name="note"
						label={t('form.note')}
						description={t('form.noteHint')}
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
