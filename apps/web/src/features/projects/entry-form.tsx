import { zodResolver } from '@hookform/resolvers/zod';
import { createProjectEntrySchema, type BookableProject } from '@zeit/shared';
import { useId } from 'react';
import { Controller, useForm, useWatch } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { errorKey } from '../../app/error-key';
import { Button } from '../../components/ui/button';
import { FormTextArea } from '../../components/ui/field';
import { Notice } from '../../components/ui/notice';
import { issueText } from '../../i18n';
import { formatMinutes } from '../../i18n/format';
import { hasCode } from '../../lib/api/errors';
import { FormDate } from '../hr/ui/date-field';
import { clockTime, minuteOf } from '../week/correction-schema';
import { FormTime } from '../week/time-field';
import { createEntry, updateEntry, useProjectMutation } from './api';
import styles from './entry-form.module.css';
import { apiFields, entrySchema, toCreate, toUpdate, type EntryValues } from './entry-schema';
import { ProjectPicker } from './project-picker';

type Props = {
	projects: BookableProject[];
	initial: EntryValues;
	// set to change that entry, without it the form books a new one
	entryId?: string | undefined;
	title: string;
	onDone: () => void;
	onCancel: () => void;
};

export function EntryForm({ projects, initial, entryId, title, onDone, onCancel }: Props) {
	const { t } = useTranslation(['projects', 'common']);
	const titleId = useId();
	const editing = entryId !== undefined;
	const { control, handleSubmit, setError } = useForm<EntryValues>({
		resolver: zodResolver(entrySchema(editing ? initial : null)),
		defaultValues: initial
	});
	const [start, end] = useWatch({ control, name: ['start', 'end'] });

	// the resolver has already run the shared schema, parsing again only gives the api its type
	const save = useProjectMutation((form: EntryValues) =>
		editing
			? updateEntry({ id: entryId, ...toUpdate(form, initial) })
			: createEntry(createProjectEntrySchema.parse(toCreate(form)))
	);

	const send = (form: EntryValues) =>
		save.mutate(form, {
			onSuccess: onDone,
			onError: (err) => {
				if (!hasCode(err, 'VALIDATION') || !Array.isArray(err.details)) return;
				for (const issue of err.details) {
					const name = apiFields[issue.field];
					if (name) setError(name, { message: issue.message });
				}
			}
		});

	// field issues already sit under their fields, everything else gets one line above the buttons
	const refusal = (err: Error) => {
		if (
			hasCode(err, 'VALIDATION') &&
			Array.isArray(err.details) &&
			err.details.some((issue) => issue.field in apiFields)
		) {
			return null;
		}
		if (hasCode(err, 'TIME_OVERLAP')) return t('entry.overlap');
		if (hasCode(err, 'INVOICED')) return t('entry.invoiced');
		if (hasCode(err, 'FORBIDDEN')) return t('entry.forbidden');
		return t(errorKey(err));
	};
	const refused = save.error ? refusal(save.error) : null;
	const minutes = minuteOf(end) - minuteOf(start);

	return (
		<form
			className={styles.form}
			noValidate
			aria-labelledby={titleId}
			onSubmit={handleSubmit(send)}
		>
			<h2 id={titleId}>{title}</h2>
			<Controller
				control={control}
				name="slot"
				render={({ field, fieldState }) => (
					<ProjectPicker
						label={t('entry.project')}
						projects={projects}
						value={field.value}
						onChange={field.onChange}
						onBlur={field.onBlur}
						error={fieldState.error?.message && issueText(fieldState.error.message)}
					/>
				)}
			/>
			<div className={styles.when}>
				<FormDate control={control} name="date" label={t('entry.date')} />
				<FormTime control={control} name="start" label={t('entry.start')} />
				<FormTime control={control} name="end" label={t('entry.end')} />
				<p className={styles.duration} aria-live="polite">
					{clockTime.test(start) &&
						clockTime.test(end) &&
						minutes > 0 &&
						t('entry.duration', { minutes: formatMinutes(minutes) })}
				</p>
			</div>
			<FormTextArea
				control={control}
				name="note"
				label={t('entry.note')}
				description={t(editing ? 'entry.noteHintEdit' : 'entry.noteHint')}
			/>
			{refused && <Notice tone="error">{refused}</Notice>}
			<div className={styles.actions}>
				<Button type="submit" variant="primary" isPending={save.isPending}>
					{t(editing ? 'entry.save' : 'entry.submit')}
				</Button>
				<Button variant="quiet" isDisabled={save.isPending} onPress={onCancel}>
					{t('common:cancel')}
				</Button>
			</div>
		</form>
	);
}
