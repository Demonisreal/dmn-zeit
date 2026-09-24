import { createFileRoute } from '@tanstack/react-router';
import { monthSchema, uuidSchema } from '@zeit/shared';
import { z } from 'zod';
import { requireRole } from '../../../app/require-role';
import { currentMonth, shiftMonth } from '../../../features/hr/dates';
import { ExportsPage } from '../../../features/hr/exports/exports-page';

const searchSchema = z.object({
	month: monthSchema.optional().catch(undefined),
	employee: uuidSchema.optional().catch(undefined)
});

export const Route = createFileRoute('/_app/hr/exports')({
	validateSearch: searchSchema,
	beforeLoad: ({ context }) => requireRole(context.session, 'hr'),
	component: ExportsRoute
});

function ExportsRoute() {
	const { month, employee } = Route.useSearch();
	const navigate = Route.useNavigate();
	return (
		<ExportsPage
			// what gets handed on is usually the month that was just closed
			month={month ?? shiftMonth(currentMonth(), -1)}
			employeeId={employee}
			onChange={(next) =>
				void navigate({ search: (prev) => ({ ...prev, ...next }), replace: true })
			}
		/>
	);
}
