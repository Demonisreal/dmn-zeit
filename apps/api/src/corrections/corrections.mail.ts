import type { Correction, Locale } from '@zeit/shared';
import { clean } from '../mail/templates';
import { TIME_ZONE } from '../time/day-engine';

type MailText = { subject: string; text: string };

const labels = {
	de: {
		added: 'Nachgetragen',
		before: 'Bisher',
		now: 'Jetzt',
		voided: 'Gestrichen',
		open: 'läuft noch'
	},
	en: { added: 'Added', before: 'Before', now: 'Now', voided: 'Removed', open: 'still running' }
} satisfies Record<Locale, Record<string, string>>;

function moment(at: string, locale: Locale) {
	const instant = new Date(at);
	const tag = locale === 'en' ? 'en-GB' : 'de-DE';
	return {
		date: new Intl.DateTimeFormat(tag, {
			day: locale === 'en' ? 'numeric' : '2-digit',
			month: locale === 'en' ? 'long' : '2-digit',
			year: 'numeric',
			timeZone: TIME_ZONE
		}).format(instant),
		time: new Intl.DateTimeFormat(tag, {
			hour: '2-digit',
			minute: '2-digit',
			hourCycle: 'h23',
			timeZone: TIME_ZONE
		}).format(instant)
	};
}

function span(startedAt: string, endedAt: string | null, locale: Locale): string {
	const start = moment(startedAt, locale);
	if (endedAt === null) return `${start.date}, ${start.time} (${labels[locale].open})`;
	const end = moment(endedAt, locale);
	return start.date === end.date
		? `${start.date}, ${start.time}–${end.time}`
		: `${start.date}, ${start.time} – ${end.date}, ${end.time}`;
}

export function correctedMail(
	locale: Locale,
	{ name, correction }: { name: string; correction: Correction }
): MailText {
	const label = labels[locale];
	const changes: string[] = [];
	if (correction.target) {
		const was = span(correction.target.startedAt, correction.target.endedAt, locale);
		changes.push(`${correction.action === 'void' ? label.voided : label.before}: ${was}`);
	}
	if (correction.newStartedAt) {
		const now = span(correction.newStartedAt, correction.newEndedAt, locale);
		changes.push(`${correction.action === 'add' ? label.added : label.now}: ${now}`);
	}
	const by = clean(correction.requestedBy.displayName);
	const on = moment(correction.createdAt, locale).date;
	const reason = clean(correction.reason);

	if (locale === 'en') {
		return {
			subject: 'Your working time was corrected',
			text: [
				`Hello ${clean(name)},`,
				'',
				`${by} corrected one of your time entries in DMN Zeit on ${on}. The correction applies right away.`,
				'',
				...changes,
				`Reason: ${reason}`,
				'',
				'If you have questions about it, please contact your HR department.'
			].join('\n')
		};
	}
	return {
		subject: 'Ihre Arbeitszeit wurde korrigiert',
		text: [
			`Hallo ${clean(name)},`,
			'',
			`${by} hat am ${on} eine Buchung Ihrer Arbeitszeit in DMN Zeit korrigiert. Die Korrektur gilt sofort.`,
			'',
			...changes,
			`Begründung: ${reason}`,
			'',
			'Haben Sie Fragen dazu, wenden Sie sich bitte an Ihre Personalverwaltung.'
		].join('\n')
	};
}
