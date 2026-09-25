import { createFileRoute } from '@tanstack/react-router';
import { requireRole } from '../../../app/require-role';
import { TenantPage } from '../../../features/admin/tenant/tenant-page';
import { i18n } from '../../../i18n';

export const Route = createFileRoute('/_app/admin/tenant')({
	beforeLoad: ({ context }) => requireRole(context.session, 'admin'),
	loader: () => i18n.loadNamespaces('admin'),
	component: TenantPage
});
