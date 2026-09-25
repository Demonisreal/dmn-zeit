import { createFileRoute } from '@tanstack/react-router';
import { SecurityPage } from '../../features/security/security-page';
import { i18n } from '../../i18n';

export const Route = createFileRoute('/_app/security')({
	loader: () => i18n.loadNamespaces('security'),
	staticData: { title: 'security' },
	component: SecurityPage
});
