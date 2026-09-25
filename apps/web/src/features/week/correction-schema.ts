import { CalendarDateTime, parseDate, toZoned } from '@internationalized/date';
import { correctionActions, reasonSchema, type CreateCorrectionInput } from '@zeit/shared';
import { z } from 'zod';
import { i18n } from '../../i18n';
import { zone } from '../../lib/dates';
import { addDays } from './dates';

export const clockTime = /^([01]\d|2[0-3]):[0-5]\d$/;

export const correctionFormSchema = z
	.object({
		action: z.enum(correctionActions),
		entryId: z.string(),
		start: z.string(),
		end: z.string(),
		reason: reasonSchema
	})
	.superRefine(
		(form, ctx) => {
			const flag = (path: 'entryId' | 'start' | 'end', message: string) =>
				ctx.addIssue({ code: 'custom', path: [path], message });
			if (form.action !== 'add' && !form.entryId) {
				flag('entryId', i18n.t('week:correction.pickEntry'));
			}
			if (form.action === 'void') return;
			if (!clockTime.test(form.start)) flag('start', i18n.t('validation.required'));
			if (!clockTime.test(form.end)) flag('end', i18n.t('validation.required'));
			else if (form.start === form.end) flag('end', i18n.t('week:correction.same'));
		},
		// also while the reason is still too short, so every problem shows on the first submit
		{ when: () => true }
	);

export type CorrectionFormInput = z.input<typeof correctionFormSchema>;
export type CorrectionFormOutput = z.output<typeof correctionFormSchema>;

export const minuteOf = (time: string) => Number(time.slice(0, 2)) * 60 + Number(time.slice(3));

function at(date: string, time: string) {
	const day = parseDate(date);
	const hour = Number(time.slice(0, 2));
	const local = new CalendarDateTime(day.year, day.month, day.day, hour, Number(time.slice(3)));
	return toZoned(local, zone).toAbsoluteString();
}

export function toCorrection(
	form: CorrectionFormOutput,
	date: string,
	employeeId: string
): CreateCorrectionInput {
	const { action, entryId, reason } = form;
	if (action === 'void') return { action, entryId, reason };
	const startedAt = at(date, form.start);
	// a clock-out earlier than the clock-in belongs to the next day
	const endedAt = at(form.end < form.start ? addDays(date, 1) : date, form.end);
	return action === 'add'
		? { action, employeeId, startedAt, endedAt, reason }
		: { action, entryId, startedAt, endedAt, reason };
}

// field names of the api body mapped onto the form
export const apiFields = {
	reason: 'reason',
	startedAt: 'start',
	endedAt: 'end',
	entryId: 'entryId'
} as const;

export const isApiField = (name: string): name is keyof typeof apiFields => name in apiFields;
