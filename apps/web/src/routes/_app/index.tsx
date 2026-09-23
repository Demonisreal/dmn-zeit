import { createFileRoute } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';

export const Route = createFileRoute('/_app/')({
	staticData: { title: 'week' },
	component: WeekPage
});

function WeekPage() {
	const { t } = useTranslation('nav');
	return <h1>{t('week')}</h1>;
}
