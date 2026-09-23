import { createFileRoute } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { requireRole } from '../../../app/require-role';

export const Route = createFileRoute('/_app/hr/')({
	beforeLoad: ({ context }) => requireRole(context.session, 'hr'),
	staticData: { title: 'hr' },
	component: HrPage
});

function HrPage() {
	const { t } = useTranslation('nav');
	return <h1>{t('hr')}</h1>;
}
