import { createFileRoute } from '@tanstack/react-router';
import { SecurityPage } from '../../features/security/security-page';

export const Route = createFileRoute('/_app/security')({
	staticData: { title: 'security' },
	component: SecurityPage
});
