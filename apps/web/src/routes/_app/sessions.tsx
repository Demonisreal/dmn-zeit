import { createFileRoute } from '@tanstack/react-router';
import { SessionList } from '../../features/security/session-list';
import { i18n } from '../../i18n';

export const Route = createFileRoute('/_app/sessions')({
	loader: () => i18n.loadNamespaces('security'),
	staticData: { title: 'sessions' },
	component: SessionList
});
