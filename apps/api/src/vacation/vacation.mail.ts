import type { Locale } from '@zeit/shared';
import { clean } from '../mail/templates';

type MailText = { subject: string; text: string };

export const NOTICE_TEXT_VERSION = '2026-09-24';

function day(iso: string, locale: Locale): string {
	return new Intl.DateTimeFormat(locale === 'en' ? 'en-GB' : 'de-DE', {
		day: locale === 'en' ? 'numeric' : '2-digit',
		month: locale === 'en' ? 'long' : '2-digit',
		year: 'numeric',
		timeZone: 'UTC'
	}).format(new Date(`${iso}T00:00:00Z`));
}

function amount(days: string, locale: Locale): string {
	return new Intl.NumberFormat(locale === 'en' ? 'en-GB' : 'de-DE', {
		maximumFractionDigits: 2
	}).format(Number(days));
}

export function leaveNoticeMail(
	locale: Locale,
	{ name, year, days, deadline }: { name: string; year: number; days: string; deadline: string }
): MailText {
	if (locale === 'en') {
		return {
			subject: `Leave forfeiture notice: remaining leave ${year}`,
			text: [
				`Hello ${clean(name)},`,
				'',
				`you still have ${amount(days, locale)} days of leave from ${year}. Please request and take this leave by ${day(deadline, locale)}.`,
				'',
				'Leave not taken by then is forfeited under § 7 Abs. 3 BUrlG without replacement. You can request it in DMN Zeit under "Leave".'
			].join('\n')
		};
	}
	return {
		subject: `Hinweis zum Urlaubsverfall: Resturlaub ${year}`,
		text: [
			`Hallo ${clean(name)},`,
			'',
			`aus dem Urlaubsjahr ${year} stehen Ihnen noch ${amount(days, locale)} Urlaubstage zu. Bitte beantragen und nehmen Sie diesen Urlaub bis zum ${day(deadline, locale)}.`,
			'',
			'Urlaub, der bis dahin nicht genommen ist, verfällt nach § 7 Abs. 3 BUrlG ersatzlos. Den Antrag stellen Sie in DMN Zeit unter „Urlaub“.'
		].join('\n')
	};
}

export function sickRefundMail(
	locale: Locale,
	{
		name,
		from,
		to,
		days,
		dates
	}: { name: string; from: string; to: string; days: string; dates: string[] }
): MailText {
	const listed = dates.map((date) => day(date, locale)).join(', ');
	if (locale === 'en') {
		return {
			subject: 'Leave credited back after your medical certificate',
			text: [
				`Hello ${clean(name)},`,
				'',
				`HR has confirmed your medical certificate for ${day(from, locale)} to ${day(to, locale)}. Under § 9 BUrlG, ${amount(days, locale)} days of leave were credited back to your leave account: ${listed}.`
			].join('\n')
		};
	}
	return {
		subject: 'Urlaub nach Attest zurückgebucht',
		text: [
			`Hallo ${clean(name)},`,
			'',
			`die Personalverwaltung hat Ihr Attest für die Zeit vom ${day(from, locale)} bis ${day(to, locale)} bestätigt. Nach § 9 BUrlG wurden ${amount(days, locale)} Urlaubstage Ihrem Urlaubskonto wieder gutgeschrieben: ${listed}.`
		].join('\n')
	};
}
