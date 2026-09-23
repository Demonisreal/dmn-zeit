import { createFileRoute } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { requireRole } from '../../../app/require-role';

export const Route = createFileRoute('/_app/admin/')({
	beforeLoad: ({ context }) => requireRole(context.session, 'admin'),
	staticData: { title: 'admin' },
	component: AdminPage
});

function AdminPage() {
	const { t } = useTranslation('nav');
	return <h1>{t('admin')}</h1>;
}
