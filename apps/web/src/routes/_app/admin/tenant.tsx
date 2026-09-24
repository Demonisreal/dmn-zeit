import { createFileRoute } from '@tanstack/react-router';
import { requireRole } from '../../../app/require-role';
import { TenantPage } from '../../../features/admin/tenant/tenant-page';

export const Route = createFileRoute('/_app/admin/tenant')({
	beforeLoad: ({ context }) => requireRole(context.session, 'admin'),
	component: TenantPage
});
