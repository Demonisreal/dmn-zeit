import { roundingModes, updateClientSchema, type RoundingMode } from '@zeit/shared';
import type { TFunction } from 'i18next';
import { z } from 'zod';
import { i18n } from '../../i18n';
import { optionalDurationField } from '../hr/duration';

// an empty input is "not set", the api keeps null for it
export const blankToNull = z.string().transform((text) => (text.trim() === '' ? null : text));

// a select cannot go back to "nothing chosen", so taking over the setting is an option of its own
export const inherit = 'inherit';

const increments = [1, 5, 6, 10, 15, 30, 60] as const;

export const incrementField = z
	.string()
	.transform((id) => (id === inherit ? null : Number(id)))
	.pipe(updateClientSchema.required().shape.roundingIncrementMin);

export const modeField = z
	.string()
	.transform((id) => (id === inherit ? null : id))
	.pipe(z.enum(roundingModes).nullable());

export const roundingOptions = (t: TFunction<'billing'>, inheritLabel: string) => ({
	increments: [
		{ id: inherit, label: inheritLabel },
		...increments.map((minutes) => ({
			id: String(minutes),
			label: t('rounding.minutes', { minutes })
		}))
	],
	modes: [
		{ id: inherit, label: inheritLabel },
		...roundingModes.map((mode) => ({ id: mode, label: t(`rounding.modes.${mode}`) }))
	]
});

export const roundingDefaults = (owner?: {
	roundingIncrementMin: number | null;
	roundingMode: RoundingMode | null;
}) => ({
	roundingIncrementMin: owner?.roundingIncrementMin ? String(owner.roundingIncrementMin) : inherit,
	roundingMode: owner?.roundingMode ?? inherit
});

// "95" and "95,50" both count; the api takes whole cents as a string and no more than 100.000 €
export const centsField = z.string().transform((text, ctx) => {
	const match = /^(\d{1,6})(?:[.,](\d{1,2}))?$/.exec(text.trim());
	const cents = match && Number(match[1]) * 100 + Number((match[2] ?? '').padEnd(2, '0'));
	if (cents === null || cents > 10_000_000) {
		ctx.addIssue({ code: 'custom', message: 'format.cents' });
		return z.NEVER;
	}
	return String(cents);
});

export const budgetField = optionalDurationField.pipe(
	z
		.int()
		.min(1, { error: () => i18n.t('billing:projects.budgetMin') })
		.nullable()
);
