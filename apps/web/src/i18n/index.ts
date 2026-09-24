import { locales, validationKeys, type Locale, type ValidationKey } from '@zeit/shared';
import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import { z } from 'zod';
import absencesDe from './locales/de/absences.json';
import adminDe from './locales/de/admin.json';
import authDe from './locales/de/auth.json';
import commonDe from './locales/de/common.json';
import hrDe from './locales/de/hr.json';
import inboxDe from './locales/de/inbox.json';
import navDe from './locales/de/nav.json';
import securityDe from './locales/de/security.json';
import teamDe from './locales/de/team.json';
import timeDe from './locales/de/time.json';
import vacationDe from './locales/de/vacation.json';
import weekDe from './locales/de/week.json';
import absencesEn from './locales/en/absences.json';
import adminEn from './locales/en/admin.json';
import authEn from './locales/en/auth.json';
import commonEn from './locales/en/common.json';
import hrEn from './locales/en/hr.json';
import inboxEn from './locales/en/inbox.json';
import navEn from './locales/en/nav.json';
import securityEn from './locales/en/security.json';
import teamEn from './locales/en/team.json';
import timeEn from './locales/en/time.json';
import vacationEn from './locales/en/vacation.json';
import weekEn from './locales/en/week.json';

export const resources = {
	de: {
		common: commonDe,
		auth: authDe,
		nav: navDe,
		week: weekDe,
		time: timeDe,
		absences: absencesDe,
		vacation: vacationDe,
		inbox: inboxDe,
		team: teamDe,
		hr: hrDe,
		admin: adminDe,
		security: securityDe
	},
	en: {
		common: commonEn,
		auth: authEn,
		nav: navEn,
		week: weekEn,
		time: timeEn,
		absences: absencesEn,
		vacation: vacationEn,
		inbox: inboxEn,
		team: teamEn,
		hr: hrEn,
		admin: adminEn,
		security: securityEn
	}
};

const storageKey = 'zeit.lang';

export const isLocale = (tag: string): tag is Locale =>
	(locales as readonly string[]).includes(tag);

// before login there is no profile yet, so the last choice on this device or the browser decides
function firstLanguage(): Locale {
	const stored = localStorage.getItem(storageKey);
	if (stored && isLocale(stored)) return stored;
	const tag = navigator.languages.map((l) => l.slice(0, 2).toLowerCase()).find(isLocale);
	return tag ?? 'de';
}

i18n.on('languageChanged', (lng) => {
	document.documentElement.lang = lng;
	localStorage.setItem(storageKey, lng);
	z.config(lng === 'en' ? z.locales.en() : z.locales.de());
});

void i18n.use(initReactI18next).init({
	resources,
	lng: firstLanguage(),
	fallbackLng: 'de',
	supportedLngs: [...locales],
	defaultNS: 'common',
	interpolation: { escapeValue: false },
	initAsync: false
});

// friendlier texts for the checks every form has, the zod locale covers the rest
z.config({
	customError: (issue) => {
		if (issue.input === '') return i18n.t('validation.required');
		if (issue.code === 'too_small' && issue.origin === 'string') {
			return i18n.t('validation.tooShort', { count: Number(issue.minimum) });
		}
		if (issue.code === 'too_big' && issue.origin === 'string') {
			return i18n.t('validation.tooLong', { count: Number(issue.maximum) });
		}
		if (issue.code === 'invalid_format' && issue.format === 'email') {
			return i18n.t('validation.email');
		}
		return undefined;
	}
});

// own checks in @zeit/shared name an i18n key as their message, the built-in ones are mapped above
export const issueText = (message: string, params?: Record<string, unknown>) =>
	(validationKeys as readonly string[]).includes(message)
		? i18n.t(`validation.${message as ValidationKey}`, params ?? {})
		: message;

export { i18n };
