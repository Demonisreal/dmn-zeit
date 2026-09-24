import { createFileRoute } from '@tanstack/react-router';
import { requireRole } from '../../../app/require-role';
import { MonthsPage } from '../../../features/hr/months/months-page';

export const Route = createFileRoute('/_app/hr/months/')({
	beforeLoad: ({ context }) => requireRole(context.session, 'hr'),
	component: MonthsPage
});
