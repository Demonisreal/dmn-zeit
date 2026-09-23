import { createFileRoute } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';

export const Route = createFileRoute('/_app/vacation')({
	staticData: { title: 'vacation' },
	component: VacationPage
});

function VacationPage() {
	const { t } = useTranslation('nav');
	return <h1>{t('vacation')}</h1>;
}
