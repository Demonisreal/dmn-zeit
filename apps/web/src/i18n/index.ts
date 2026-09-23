import { locales, type Locale } from '@zeit/shared';
import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import { z } from 'zod';
import authDe from './locales/de/auth.json';
import commonDe from './locales/de/common.json';
import navDe from './locales/de/nav.json';
import authEn from './locales/en/auth.json';
import commonEn from './locales/en/common.json';
import navEn from './locales/en/nav.json';

export const resources = {
	de: { common: commonDe, auth: authDe, nav: navDe },
	en: { common: commonEn, auth: authEn, nav: navEn }
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

// the shared schemas carry no texts of their own, the messages are resolved at parse time
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

export { i18n };
