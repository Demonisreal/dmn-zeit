import { createFileRoute } from '@tanstack/react-router';
import { yearSchema } from '@zeit/shared';
import { z } from 'zod';
import { currentYear } from '../../features/absences/dates';
import { VacationPage } from '../../features/vacation/vacation-page';

const searchSchema = z.object({
	year: yearSchema.optional().catch(undefined)
});

export const Route = createFileRoute('/_app/vacation')({
	validateSearch: searchSchema,
	staticData: { title: 'vacation' },
	component: VacationRoute
});

function VacationRoute() {
	const { session } = Route.useRouteContext();
	const { year } = Route.useSearch();
	const navigate = Route.useNavigate();
	return (
		<VacationPage
			employeeId={session.user.employeeId}
			year={year ?? currentYear()}
			onYear={(next) => void navigate({ search: { year: next }, replace: true })}
		/>
	);
}
