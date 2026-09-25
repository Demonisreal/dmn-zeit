import { createFileRoute } from '@tanstack/react-router';
import { absenceStatuses, absenceTypes, isoDateSchema, yearSchema } from '@zeit/shared';
import { z } from 'zod';
import { AbsencesPage } from '../../features/absences/absences-page';
import { ownAbsencesQuery } from '../../features/absences/api';
import { currentYear } from '../../lib/dates';

const searchSchema = z.object({
	year: yearSchema.optional().catch(undefined),
	type: z.enum(absenceTypes).optional().catch(undefined),
	status: z.enum(absenceStatuses).optional().catch(undefined),
	// a day from the week page, opens the form with it already filled in
	start: isoDateSchema.optional().catch(undefined)
});

export const Route = createFileRoute('/_app/absences')({
	validateSearch: searchSchema,
	loaderDeps: ({ search }) => ({ year: search.year, type: search.type, status: search.status }),
	loader: ({ context, deps, cause }) => {
		if (!context.session.user.employeeId) return;
		const list = context.queryClient.prefetchInfiniteQuery(
			ownAbsencesQuery(deps.year ?? currentYear(), deps.type, deps.status)
		);
		// a new filter keeps the page responsive, the list shows its own loading state
		return cause === 'stay' ? undefined : list;
	},
	staticData: { title: 'requests' },
	component: AbsencesRoute
});

function AbsencesRoute() {
	const { session } = Route.useRouteContext();
	const search = Route.useSearch();
	const navigate = Route.useNavigate();
	return (
		<AbsencesPage
			employeeId={session.user.employeeId}
			start={search.start}
			year={search.year ?? currentYear()}
			type={search.type}
			status={search.status}
			onSearch={(next) =>
				void navigate({ search: (prev) => ({ ...prev, ...next }), replace: true })
			}
		/>
	);
}
