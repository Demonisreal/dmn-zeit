import { createFileRoute } from '@tanstack/react-router';
import { yearSchema } from '@zeit/shared';
import { z } from 'zod';
import { vacationQuery } from '../../features/vacation/api';
import { VacationPage } from '../../features/vacation/vacation-page';
import { currentYear } from '../../lib/dates';

const searchSchema = z.object({
	year: yearSchema.optional().catch(undefined)
});

export const Route = createFileRoute('/_app/vacation')({
	validateSearch: searchSchema,
	loaderDeps: ({ search }) => ({ year: search.year }),
	loader: ({ context, deps, cause }) => {
		const { employeeId } = context.session.user;
		if (!employeeId) return;
		const account = context.queryClient.prefetchQuery(
			vacationQuery(employeeId, deps.year ?? currentYear())
		);
		return cause === 'stay' ? undefined : account;
	},
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
