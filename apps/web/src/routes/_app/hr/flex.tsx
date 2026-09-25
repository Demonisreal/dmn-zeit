import { createFileRoute } from '@tanstack/react-router';
import { uuidSchema, yearSchema } from '@zeit/shared';
import { z } from 'zod';
import { requireRole } from '../../../app/require-role';
import { FlexPage } from '../../../features/hr/flex/flex-page';
import { currentYear } from '../../../lib/dates';

const searchSchema = z.object({
	employee: uuidSchema.optional().catch(undefined),
	year: yearSchema.optional().catch(undefined)
});

export const Route = createFileRoute('/_app/hr/flex')({
	validateSearch: searchSchema,
	beforeLoad: ({ context }) => requireRole(context.session, 'hr'),
	component: FlexRoute
});

function FlexRoute() {
	const { employee, year } = Route.useSearch();
	const navigate = Route.useNavigate();
	return (
		<FlexPage
			employeeId={employee}
			year={year ?? currentYear()}
			onChange={(next) =>
				void navigate({ search: (prev) => ({ ...prev, ...next }), replace: true })
			}
		/>
	);
}
