import { createFileRoute } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';

export const Route = createFileRoute('/_app/absences')({
	staticData: { title: 'requests' },
	component: AbsencesPage
});

function AbsencesPage() {
	const { t } = useTranslation('nav');
	return <h1>{t('requests')}</h1>;
}
