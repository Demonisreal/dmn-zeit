import { createFileRoute } from '@tanstack/react-router';
import { isoDateSchema, uuidSchema } from '@zeit/shared';
import { z } from 'zod';
import { requireRole } from '../../../app/require-role';
import { FindingsPage } from '../../../features/hr/findings/findings-page';
import { stateFilters } from '../../../features/hr/findings/state-filters';
import { currentYear, todayIso } from '../../../lib/dates';

const searchSchema = z.object({
	state: z.enum(stateFilters).default('open').catch('open'),
	from: isoDateSchema.optional().catch(undefined),
	to: isoDateSchema.optional().catch(undefined),
	employee: uuidSchema.optional().catch(undefined)
});

export const Route = createFileRoute('/_app/hr/findings')({
	validateSearch: searchSchema,
	beforeLoad: ({ context }) => requireRole(context.session, 'hr'),
	component: FindingsRoute
});

function FindingsRoute() {
	const search = Route.useSearch();
	const navigate = Route.useNavigate();
	return (
		<FindingsPage
			filter={{
				state: search.state,
				from: search.from ?? `${currentYear()}-01-01`,
				to: search.to ?? todayIso(),
				employee: search.employee
			}}
			onFilter={(next) =>
				void navigate({ search: (prev) => ({ ...prev, ...next }), replace: true })
			}
		/>
	);
}
