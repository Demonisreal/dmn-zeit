import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { correctionActions, type Day } from '@zeit/shared';
import { useId } from 'react';
import { FieldError, Label, Radio, RadioGroup } from 'react-aria-components';
import { Controller, useForm, useWatch } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { errorKey } from '../../app/error-key';
import { Button } from '../../components/ui/button';
import { FormTextArea } from '../../components/ui/field';
import { Notice } from '../../components/ui/notice';
import { formatMinutes, formatTime } from '../../i18n/format';
import { hasCode } from '../../lib/api/errors';
import { createCorrection } from './api';
import {
	apiFields,
	clockTime,
	correctionFormSchema,
	isApiField,
	minuteOf,
	toCorrection,
	type CorrectionFormInput,
	type CorrectionFormOutput
} from './correction-schema';
import css from './form.module.css';
import { FormTime } from './time-field';

// react-aria refuses className={undefined}, naming the classes keeps them plain strings
const styles = css as Record<
	| 'form'
	| 'group'
	| 'legend'
	| 'options'
	| 'radio'
	| 'mono'
	| 'error'
	| 'times'
	| 'duration'
	| 'actions',
	string
>;

type Props = {
	day: Day;
	employeeId: string;
	onSent: () => void;
	onCancel: () => void;
};

export function CorrectionForm({ day, employeeId, onSent, onCancel }: Props) {
	const { t, i18n } = useTranslation(['week', 'common']);
	const queryClient = useQueryClient();
	const titleId = useId();
	const hhmm = (instant: string | null | undefined) =>
		instant ? formatTime(instant, i18n.language) : '';
	const last = day.entries.at(-1);

	const { control, handleSubmit, getValues, setValue, setError } = useForm<
		CorrectionFormInput,
		unknown,
		CorrectionFormOutput
	>({
		resolver: zodResolver(correctionFormSchema),
		defaultValues: {
			action: last ? 'change' : 'add',
			entryId: last?.id ?? '',
			start: hhmm(last?.startedAt),
			end: hhmm(last?.endedAt),
			reason: ''
		}
	});
	const [action, start, end] = useWatch({ control, name: ['action', 'start', 'end'] });

	const send = useMutation({
		mutationFn: createCorrection,
		onSuccess: () => {
			void queryClient.invalidateQueries({ queryKey: ['corrections'] });
			onSent();
		},
		onError: (err) => {
			if (!hasCode(err, 'VALIDATION') || !Array.isArray(err.details)) return;
			for (const issue of err.details) {
				if (isApiField(issue.field)) setError(apiFields[issue.field], { message: issue.message });
			}
		}
	});

	const fill = (entryId: string) => {
		const entry = day.entries.find((candidate) => candidate.id === entryId);
		setValue('start', hhmm(entry?.startedAt));
		setValue('end', hhmm(entry?.endedAt));
	};

	// field issues already sit under their fields, everything else gets one line above the buttons
	const refusal = (err: Error) => {
		if (
			hasCode(err, 'VALIDATION') &&
			Array.isArray(err.details) &&
			err.details.some((issue) => isApiField(issue.field))
		) {
			return null;
		}
		if (hasCode(err, 'PERIOD_LOCKED')) return t('correction.locked');
		if (hasCode(err, 'TIME_OVERLAP')) return t('correction.overlap');
		return t(errorKey(err));
	};
	const refused = send.error ? refusal(send.error) : null;

	const timed = clockTime.test(start) && clockTime.test(end) && start !== end;
	const overnight = end < start;

	return (
		<form
			className={styles.form}
			noValidate
			aria-labelledby={titleId}
			onSubmit={handleSubmit((form) => send.mutate(toCorrection(form, day.date, employeeId)))}
		>
			<h4 id={titleId}>{t('correction.title')}</h4>
			<Controller
				control={control}
				name="action"
				render={({ field }) => (
					<RadioGroup
						value={field.value}
						onChange={(picked) => {
							field.onChange(picked);
							if (picked === 'change') fill(getValues('entryId'));
							if (picked === 'add') fill('');
						}}
						orientation="horizontal"
						className={styles.group}
					>
						<Label className={styles.legend}>{t('correction.action')}</Label>
						<div className={styles.options}>
							{correctionActions.map((option) => (
								<Radio
									key={option}
									value={option}
									isDisabled={option !== 'add' && day.entries.length === 0}
									autoFocus={option === field.value}
									className={styles.radio}
								>
									{t(`correction.${option}`)}
								</Radio>
							))}
						</div>
					</RadioGroup>
				)}
			/>
			{action !== 'add' && (
				<Controller
					control={control}
					name="entryId"
					render={({ field, fieldState }) => (
						<RadioGroup
							value={field.value}
							onChange={(picked) => {
								field.onChange(picked);
								if (action === 'change') fill(picked);
							}}
							isInvalid={fieldState.error !== undefined}
							validationBehavior="aria"
							className={styles.group}
						>
							<Label className={styles.legend}>{t('correction.entry')}</Label>
							<div className={styles.options}>
								{day.entries.map((entry) => (
									<Radio
										key={entry.id}
										value={entry.id}
										className={`${styles.radio} ${styles.mono}`}
									>
										{entry.endedAt
											? t('detail.span', { from: hhmm(entry.startedAt), to: hhmm(entry.endedAt) })
											: t('detail.since', { from: hhmm(entry.startedAt) })}
									</Radio>
								))}
							</div>
							<FieldError className={styles.error}>{fieldState.error?.message}</FieldError>
						</RadioGroup>
					)}
				/>
			)}
			{action !== 'void' && (
				<div className={styles.times}>
					<FormTime control={control} name="start" label={t('correction.start')} />
					<FormTime control={control} name="end" label={t('correction.end')} />
					<p className={styles.duration} aria-live="polite">
						{timed &&
							t(overnight ? 'correction.durationNextDay' : 'correction.duration', {
								minutes: formatMinutes(minuteOf(end) - minuteOf(start) + (overnight ? 24 * 60 : 0))
							})}
					</p>
				</div>
			)}
			<FormTextArea
				control={control}
				name="reason"
				label={t('correction.reason')}
				description={t('correction.reasonHint')}
			/>
			{refused && <Notice tone="error">{refused}</Notice>}
			<div className={styles.actions}>
				<Button type="submit" variant="primary" isPending={send.isPending}>
					{t('correction.submit')}
				</Button>
				<Button variant="quiet" isDisabled={send.isPending} onPress={onCancel}>
					{t('correction.cancel')}
				</Button>
			</div>
		</form>
	);
}
