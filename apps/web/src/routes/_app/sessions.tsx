import { createFileRoute } from '@tanstack/react-router';
import { SessionList } from '../../features/security/session-list';

export const Route = createFileRoute('/_app/sessions')({
	staticData: { title: 'sessions' },
	component: SessionList
});
