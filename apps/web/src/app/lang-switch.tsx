import { useMutation, useQueryClient } from '@tanstack/react-query';
import { locales, type Locale } from '@zeit/shared';
import { useTranslation } from 'react-i18next';
import { saveLocale, sessionQuery } from '../lib/api/auth';
import styles from './lang-switch.module.css';

export function LangSwitch() {
	const { t, i18n } = useTranslation();
	const queryClient = useQueryClient();
	const save = useMutation({
		mutationFn: saveLocale,
		onSuccess: (user) =>
			queryClient.setQueryData(sessionQuery.queryKey, (session) => session && { ...session, user })
	});

	const pick = (lng: Locale) => {
		if (lng === i18n.language) return;
		void i18n.changeLanguage(lng);
		if (queryClient.getQueryData(sessionQuery.queryKey)) save.mutate(lng);
	};

	return (
		<div className={styles.lang} role="group" aria-label={t('language')}>
			{locales.map((lng) => (
				<button
					key={lng}
					type="button"
					lang={lng}
					aria-pressed={i18n.language === lng}
					onClick={() => pick(lng)}
				>
					{lng.toUpperCase()}
				</button>
			))}
		</div>
	);
}
