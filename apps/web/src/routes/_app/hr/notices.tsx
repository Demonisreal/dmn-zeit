import { createFileRoute } from '@tanstack/react-router';
import { requireRole } from '../../../app/require-role';
import { NoticesPage } from '../../../features/hr/notices/notices-page';

export const Route = createFileRoute('/_app/hr/notices')({
	beforeLoad: ({ context }) => requireRole(context.session, 'hr'),
	component: NoticesPage
});
