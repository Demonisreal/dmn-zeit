import { locales, validationKeys, type Locale, type ValidationKey } from '@zeit/shared';
import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import { z } from 'zod';
import absencesDe from './locales/de/absences.json';
import type adminDe from './locales/de/admin.json';
import type billingDe from './locales/de/billing.json';
import authDe from './locales/de/auth.json';
import commonDe from './locales/de/common.json';
import type demoDe from './locales/de/demo.json';
import type hrDe from './locales/de/hr.json';
import inboxDe from './locales/de/inbox.json';
import navDe from './locales/de/nav.json';
import projectsDe from './locales/de/projects.json';
import type securityDe from './locales/de/security.json';
import teamDe from './locales/de/team.json';
import timeDe from './locales/de/time.json';
import vacationDe from './locales/de/vacation.json';
import weekDe from './locales/de/week.json';

// German is the fallback and ships with the app, English and the area namespaces load on demand
const bundled = {
	common: commonDe,
	auth: authDe,
	nav: navDe,
	week: weekDe,
	time: timeDe,
	absences: absencesDe,
	vacation: vacationDe,
	inbox: inboxDe,
	team: teamDe,
	projects: projectsDe
};

export type Resources = typeof bundled & {
	hr: typeof hrDe;
	admin: typeof adminDe;
	security: typeof securityDe;
	demo: typeof demoDe;
	billing: typeof billingDe;
};

const later = import.meta.glob<Record<string, unknown>>(
	['./locales/en/*.json', './locales/de/{hr,admin,security,demo,billing}.json'],
	{ import: 'default' }
);

// with only language and namespace as parameters i18next awaits the returned promise
const chunks = {
	type: 'backend' as const,
	read: (lng: string, ns: string) => later[`./locales/${lng}/${ns}.json`]!()
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

export const i18nReady = i18n
	.use(chunks)
	.use(initReactI18next)
	.init({
		resources: { de: bundled },
		partialBundledLanguages: true,
		ns: Object.keys(bundled),
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
