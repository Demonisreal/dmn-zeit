import { createFileRoute } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';

export const Route = createFileRoute('/_app/time')({
	staticData: { title: 'time' },
	component: TimePage
});

function TimePage() {
	const { t } = useTranslation('nav');
	return <h1>{t('time')}</h1>;
}
