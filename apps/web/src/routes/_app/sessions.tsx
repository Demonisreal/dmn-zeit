import { createFileRoute } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';

export const Route = createFileRoute('/_app/sessions')({
	staticData: { title: 'sessions' },
	component: SessionsPage
});

function SessionsPage() {
	const { t } = useTranslation('nav');
	return <h1>{t('sessions')}</h1>;
}
