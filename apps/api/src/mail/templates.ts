import type { Locale } from '@zeit/shared';

type MailText = { subject: string; text: string };

export function invitationMail(
	locale: Locale,
	{ name, tenant, link }: { name: string; tenant: string; link: string }
): MailText {
	if (locale === 'en') {
		return {
			subject: `Invitation to DMN Zeit (${tenant})`,
			text: [
				`Hello ${name},`,
				'',
				`${tenant} has set up an account for you in DMN Zeit, the time tracking of your company. Use this link to choose your password:`,
				'',
				link,
				'',
				'The link works once and for 7 days. After that, your administrator can send a new invitation.'
			].join('\n')
		};
	}
	return {
		subject: `Einladung zu DMN Zeit (${tenant})`,
		text: [
			`Hallo ${name},`,
			'',
			`${tenant} hat für Sie einen Zugang zu DMN Zeit angelegt, der Zeiterfassung Ihres Betriebs. Über diesen Link legen Sie Ihr Passwort fest:`,
			'',
			link,
			'',
			'Der Link gilt 7 Tage und nur einmal. Danach kann Ihre Administration eine neue Einladung schicken.'
		].join('\n')
	};
}

export function resetMail(
	locale: Locale,
	{ name, link }: { name: string; link: string }
): MailText {
	if (locale === 'en') {
		return {
			subject: 'Reset your DMN Zeit password',
			text: [
				`Hello ${name},`,
				'',
				'a new password was requested for your DMN Zeit account. Use this link to set it:',
				'',
				link,
				'',
				'The link works once and for 30 minutes. If you did not ask for it, ignore this message, your password stays as it is.'
			].join('\n')
		};
	}
	return {
		subject: 'Passwort für DMN Zeit zurücksetzen',
		text: [
			`Hallo ${name},`,
			'',
			'für Ihren Zugang zu DMN Zeit wurde ein neues Passwort angefordert. Über diesen Link legen Sie es fest:',
			'',
			link,
			'',
			'Der Link gilt 30 Minuten und nur einmal. Haben Sie nichts angefordert, ignorieren Sie diese Nachricht, Ihr Passwort bleibt unverändert.'
		].join('\n')
	};
}

export function passwordChangedMail(locale: Locale, { name }: { name: string }): MailText {
	if (locale === 'en') {
		return {
			subject: 'Your DMN Zeit password was changed',
			text: [
				`Hello ${name},`,
				'',
				'the password of your DMN Zeit account was just changed. Other signed-in devices were signed out.',
				'',
				'If this was not you, set a new password via "Forgot password" and tell your administrator.'
			].join('\n')
		};
	}
	return {
		subject: 'Ihr Passwort für DMN Zeit wurde geändert',
		text: [
			`Hallo ${name},`,
			'',
			'das Passwort Ihres Zugangs zu DMN Zeit wurde soeben geändert. Andere angemeldete Geräte wurden dabei abgemeldet.',
			'',
			'Waren Sie das nicht, setzen Sie über „Passwort vergessen“ ein neues Passwort und informieren Sie Ihre Administration.'
		].join('\n')
	};
}
