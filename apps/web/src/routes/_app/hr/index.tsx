import { createFileRoute } from '@tanstack/react-router';
import { requireRole } from '../../../app/require-role';
import { PeoplePage } from '../../../features/hr/people/people-page';

export const Route = createFileRoute('/_app/hr/')({
	beforeLoad: ({ context }) => requireRole(context.session, 'hr'),
	staticData: { title: 'hr' },
	component: PeoplePage
});
