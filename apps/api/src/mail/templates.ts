import type { Locale } from '@zeit/shared';

type MailText = { subject: string; text: string };

export function clean(text: string): string {
	return text.replace(/[\p{Cc}\p{Cf}\p{Zl}\p{Zp}]+/gu, ' ').trim();
}

export function invitationMail(
	locale: Locale,
	{ name, tenant, link }: { name: string; tenant: string; link: string }
): MailText {
	const person = clean(name);
	const company = clean(tenant);
	if (locale === 'en') {
		return {
			subject: `Invitation to DMN Zeit (${company})`,
			text: [
				`Hello ${person},`,
				'',
				`${company} has set up an account for you in DMN Zeit, the time tracking of your company. Use this link to choose your password:`,
				'',
				link,
				'',
				'The link works once and for 7 days. After that, your administrator can send a new invitation.'
			].join('\n')
		};
	}
	return {
		subject: `Einladung zu DMN Zeit (${company})`,
		text: [
			`Hallo ${person},`,
			'',
			`${company} hat für Sie einen Zugang zu DMN Zeit angelegt, der Zeiterfassung Ihres Betriebs. Über diesen Link legen Sie Ihr Passwort fest:`,
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
				`Hello ${clean(name)},`,
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
			`Hallo ${clean(name)},`,
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
				`Hello ${clean(name)},`,
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
			`Hallo ${clean(name)},`,
			'',
			'das Passwort Ihres Zugangs zu DMN Zeit wurde soeben geändert. Andere angemeldete Geräte wurden dabei abgemeldet.',
			'',
			'Waren Sie das nicht, setzen Sie über „Passwort vergessen“ ein neues Passwort und informieren Sie Ihre Administration.'
		].join('\n')
	};
}

type Notice = { subject: string; lines: string[] };

const notYou: Record<Locale, string> = {
	de: 'Waren Sie das nicht, wenden Sie sich bitte umgehend an Ihre Administration.',
	en: 'If this was not you, please contact your administrator right away.'
};

function notice(locale: Locale, name: string, texts: Record<Locale, Notice>): MailText {
	const { subject, lines } = texts[locale];
	const greeting = locale === 'en' ? `Hello ${clean(name)},` : `Hallo ${clean(name)},`;
	return { subject, text: [greeting, '', ...lines].join('\n') };
}

export function totpEnabledMail(locale: Locale, { name }: { name: string }): MailText {
	return notice(locale, name, {
		de: {
			subject: 'Authenticator-App für DMN Zeit eingerichtet',
			lines: [
				'für Ihren Zugang zu DMN Zeit wurde eine Authenticator-App als zweiter Faktor eingerichtet.',
				'',
				notYou.de
			]
		},
		en: {
			subject: 'Authenticator app set up for DMN Zeit',
			lines: [
				'an authenticator app was set up as second factor for your DMN Zeit account.',
				'',
				notYou.en
			]
		}
	});
}

export function totpRemovedMail(locale: Locale, { name }: { name: string }): MailText {
	return notice(locale, name, {
		de: {
			subject: 'Authenticator-App aus DMN Zeit entfernt',
			lines: [
				'die Authenticator-App wurde als zweiter Faktor Ihres Zugangs zu DMN Zeit entfernt.',
				'',
				notYou.de
			]
		},
		en: {
			subject: 'Authenticator app removed from DMN Zeit',
			lines: [
				'the authenticator app was removed as second factor of your DMN Zeit account.',
				'',
				notYou.en
			]
		}
	});
}

export function passkeyAddedMail(
	locale: Locale,
	{ name, passkey }: { name: string; passkey: string }
): MailText {
	return notice(locale, name, {
		de: {
			subject: 'Neuer Passkey für DMN Zeit',
			lines: [
				`Ihrem Zugang zu DMN Zeit wurde der Passkey „${clean(passkey)}“ hinzugefügt.`,
				'',
				notYou.de
			]
		},
		en: {
			subject: 'New passkey for DMN Zeit',
			lines: [`the passkey "${clean(passkey)}" was added to your DMN Zeit account.`, '', notYou.en]
		}
	});
}

export function passkeyRemovedMail(
	locale: Locale,
	{ name, passkey }: { name: string; passkey: string }
): MailText {
	return notice(locale, name, {
		de: {
			subject: 'Passkey aus DMN Zeit entfernt',
			lines: [
				`der Passkey „${clean(passkey)}“ wurde aus Ihrem Zugang zu DMN Zeit entfernt.`,
				'',
				notYou.de
			]
		},
		en: {
			subject: 'Passkey removed from DMN Zeit',
			lines: [
				`the passkey "${clean(passkey)}" was removed from your DMN Zeit account.`,
				'',
				notYou.en
			]
		}
	});
}

export function recoveryCodesRenewedMail(locale: Locale, { name }: { name: string }): MailText {
	return notice(locale, name, {
		de: {
			subject: 'Neue Wiederherstellungscodes für DMN Zeit',
			lines: [
				'für Ihren Zugang zu DMN Zeit wurden neue Wiederherstellungscodes erzeugt. Die bisherigen gelten nicht mehr.',
				'',
				notYou.de
			]
		},
		en: {
			subject: 'New recovery codes for DMN Zeit',
			lines: [
				'new recovery codes were created for your DMN Zeit account. The previous ones no longer work.',
				'',
				notYou.en
			]
		}
	});
}

export function recoveryCodeUsedMail(locale: Locale, { name }: { name: string }): MailText {
	return notice(locale, name, {
		de: {
			subject: 'Anmeldung mit Wiederherstellungscode bei DMN Zeit',
			lines: [
				'bei Ihrem Zugang zu DMN Zeit hat sich soeben jemand mit einem Wiederherstellungscode angemeldet. Dieser Code gilt jetzt nicht mehr.',
				'',
				notYou.de
			]
		},
		en: {
			subject: 'Sign-in with a recovery code at DMN Zeit',
			lines: [
				'someone just signed in to your DMN Zeit account with a recovery code. That code no longer works.',
				'',
				notYou.en
			]
		}
	});
}

export function billingIbanChangedMail(
	locale: Locale,
	{ name, lastFour }: { name: string; lastFour: string | null }
): MailText {
	const account = lastFour ? `…${lastFour}` : locale === 'en' ? 'removed' : 'entfernt';
	return notice(locale, name, {
		de: {
			subject: 'Bankverbindung für Rechnungen geändert',
			lines: [
				`die Bankverbindung Ihres Betriebs für Rechnungen wurde geändert (IBAN endet auf ${account}).`,
				'',
				notYou.de
			]
		},
		en: {
			subject: 'Bank account for invoices changed',
			lines: [
				`the bank account of your business for invoices was changed (IBAN ends in ${account}).`,
				'',
				notYou.en
			]
		}
	});
}

export function mfaResetMail(
	locale: Locale,
	{ name, link }: { name: string; link: string }
): MailText {
	return notice(locale, name, {
		de: {
			subject: 'Zwei-Faktor-Anmeldung für DMN Zeit zurückgesetzt',
			lines: [
				'Ihre Administration hat die Zwei-Faktor-Anmeldung und das Passwort Ihres Zugangs zu DMN Zeit zurückgesetzt und alle Sitzungen beendet. Über diesen Link legen Sie ein neues Passwort fest:',
				'',
				link,
				'',
				'Der Link gilt 30 Minuten und nur einmal, danach fordern Sie über „Passwort vergessen“ einen neuen an. Beim nächsten Anmelden richten Sie eine Authenticator-App oder einen Passkey neu ein.',
				'',
				'Haben Sie das nicht veranlasst, fragen Sie bitte bei Ihrer Administration nach.'
			]
		},
		en: {
			subject: 'Two-factor sign-in for DMN Zeit was reset',
			lines: [
				'your administrator reset the two-factor sign-in and the password of your DMN Zeit account and ended all sessions. Use this link to choose a new password:',
				'',
				link,
				'',
				'The link works once and for 30 minutes, after that request a new one via "Forgot password". At your next sign-in you set up an authenticator app or a passkey again.',
				'',
				'If you did not ask for this, please check with your administrator.'
			]
		}
	});
}
