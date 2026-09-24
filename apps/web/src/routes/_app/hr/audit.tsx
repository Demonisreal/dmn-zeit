import { createFileRoute } from '@tanstack/react-router';
import { isoDateSchema, uuidSchema } from '@zeit/shared';
import { z } from 'zod';
import { requireRole } from '../../../app/require-role';
import { AuditPage } from '../../../features/hr/audit/audit-page';
import { todayIso } from '../../../features/hr/dates';

const searchSchema = z.object({
	from: isoDateSchema.optional().catch(undefined),
	to: isoDateSchema.optional().catch(undefined),
	table: z
		.string()
		.regex(/^[a-z_]{1,63}$/)
		.optional()
		.catch(undefined),
	employee: uuidSchema.optional().catch(undefined)
});

const daysAgo = (days: number) =>
	new Date(Date.parse(todayIso()) - days * 86_400_000).toISOString().slice(0, 10);

export const Route = createFileRoute('/_app/hr/audit')({
	validateSearch: searchSchema,
	beforeLoad: ({ context }) => requireRole(context.session, 'hr'),
	component: AuditRoute
});

function AuditRoute() {
	const search = Route.useSearch();
	const navigate = Route.useNavigate();
	return (
		<AuditPage
			filter={{
				from: search.from ?? daysAgo(29),
				to: search.to ?? todayIso(),
				table: search.table,
				employee: search.employee
			}}
			onFilter={(next) =>
				void navigate({ search: (prev) => ({ ...prev, ...next }), replace: true })
			}
		/>
	);
}
