import { CalendarDateTime, parseDate, toZoned } from '@internationalized/date';
import {
	createProjectEntrySchema,
	updateProjectEntrySchema,
	type UpdateProjectEntryInput
} from '@zeit/shared';
import { z } from 'zod';
import { i18n } from '../../i18n';
import { formatTime } from '../../i18n/format';
import { zone } from '../../lib/dates';
import { clockTime } from '../week/correction-schema';
import { dateOf } from '../week/dates';
import { slotKey, slotOf } from './project-picker';

const entryFormSchema = z.object({
	slot: z.string(),
	date: z.string(),
	start: z.string(),
	end: z.string(),
	note: z.string()
});

export type EntryValues = z.infer<typeof entryFormSchema>;

function at(date: string, time: string) {
	const day = parseDate(date);
	const local = new CalendarDateTime(
		day.year,
		day.month,
		day.day,
		Number(time.slice(0, 2)),
		Number(time.slice(3))
	);
	return toZoned(local, zone).toAbsoluteString();
}

// the form keeps the berlin wall clock, the api instants
export function valuesOf(entry: {
	projectId: string;
	taskId: string | null;
	startedAt: string;
	endedAt: string | null;
	note?: string | null;
}): EntryValues {
	return {
		slot: slotKey(entry),
		date: dateOf(entry.startedAt),
		start: formatTime(entry.startedAt, 'de'),
		// an end on another day than the start would not fit the one date field
		end:
			entry.endedAt && dateOf(entry.endedAt) === dateOf(entry.startedAt)
				? formatTime(entry.endedAt, 'de')
				: '',
		note: entry.note ?? ''
	};
}

export function toCreate(form: EntryValues) {
	const { projectId, taskId } = slotOf(form.slot);
	return {
		projectId,
		...(taskId && { taskId }),
		startedAt: at(form.date, form.start),
		endedAt: at(form.date, form.end),
		...(form.note.trim() && { note: form.note })
	};
}

// only what changed, so a note the timer wrote survives a corrected end
export function toUpdate(form: EntryValues, before: EntryValues): UpdateProjectEntryInput {
	const patch: UpdateProjectEntryInput = {};
	if (form.slot !== before.slot) {
		const { projectId, taskId } = slotOf(form.slot);
		Object.assign(patch, { projectId, taskId });
	}
	if (form.date !== before.date || form.start !== before.start) {
		patch.startedAt = at(form.date, form.start);
	}
	if (form.date !== before.date || form.end !== before.end) patch.endedAt = at(form.date, form.end);
	if (form.note !== before.note) patch.note = form.note.trim() ? form.note : null;
	return patch;
}

// field names of the api body mapped onto the form
export const apiFields: Record<string, keyof EntryValues> = {
	projectId: 'slot',
	taskId: 'slot',
	startedAt: 'start',
	endedAt: 'end',
	note: 'note'
};

// before is the entry as it was, without it the form books a new one and the note is required
export const entrySchema = (before: EntryValues | null) =>
	entryFormSchema.superRefine((form, ctx) => {
		const flag = (path: keyof EntryValues, message: string) =>
			ctx.addIssue({ code: 'custom', path: [path], message });
		const required = i18n.t('validation.required');
		if (!form.slot) flag('slot', required);
		if (!form.date) flag('date', required);
		if (!clockTime.test(form.start)) flag('start', required);
		if (!clockTime.test(form.end)) flag('end', required);
		if (!form.slot || !form.date || !clockTime.test(form.start) || !clockTime.test(form.end)) {
			if (!before && !form.note.trim()) flag('note', 'project.noteRequired');
			return;
		}
		// the shared schemas answer end before start and the missing note with their own keys
		const parsed = before
			? updateProjectEntrySchema.safeParse({
					...toUpdate(form, before),
					startedAt: at(form.date, form.start),
					endedAt: at(form.date, form.end)
				})
			: createProjectEntrySchema.safeParse(toCreate(form));
		for (const issue of parsed.error?.issues ?? []) {
			const name = apiFields[String(issue.path[0])];
			if (name) flag(name, issue.message);
		}
	});
