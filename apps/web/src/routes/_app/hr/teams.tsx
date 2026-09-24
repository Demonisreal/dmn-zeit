import { createFileRoute } from '@tanstack/react-router';
import { requireRole } from '../../../app/require-role';
import { TeamsPage } from '../../../features/hr/teams/teams-page';

export const Route = createFileRoute('/_app/hr/teams')({
	beforeLoad: ({ context }) => requireRole(context.session, 'hr'),
	component: TeamsPage
});
