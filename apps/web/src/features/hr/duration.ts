import { z } from 'zod';
import { i18n } from '../../i18n';

// "7:30", "7" and "-2:15" all count, plain hours are what people type most
const pattern = /^([+-]?)(\d{1,4})(?::([0-5]\d))?$/;

export function parseDuration(text: string) {
	const match = pattern.exec(text.trim().replace('−', '-'));
	if (!match) return null;
	const minutes = Number(match[2]) * 60 + Number(match[3] ?? 0);
	return match[1] === '-' ? -minutes : minutes;
}

export function durationText(minutes: number) {
	const abs = Math.abs(minutes);
	return `${minutes < 0 ? '-' : ''}${Math.floor(abs / 60)}:${String(abs % 60).padStart(2, '0')}`;
}

export const durationField = z.string().transform((text, ctx) => {
	const minutes = parseDuration(text);
	if (minutes === null) {
		ctx.addIssue({
			code: 'custom',
			message: text.trim() === '' ? i18n.t('validation.required') : i18n.t('hr:duration.invalid')
		});
		return z.NEVER;
	}
	return minutes;
});

// empty means the company default applies
export const optionalDurationField = z.string().transform((text, ctx) => {
	if (text.trim() === '') return null;
	const minutes = parseDuration(text);
	if (minutes === null) {
		ctx.addIssue({ code: 'custom', message: i18n.t('hr:duration.invalid') });
		return z.NEVER;
	}
	return minutes;
});
