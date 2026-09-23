import { createFileRoute } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { requireRole } from '../../app/require-role';

export const Route = createFileRoute('/_app/inbox')({
	beforeLoad: ({ context }) => requireRole(context.session, 'team_lead'),
	staticData: { title: 'inbox' },
	component: InboxPage
});

function InboxPage() {
	const { t } = useTranslation('nav');
	return <h1>{t('inbox')}</h1>;
}
