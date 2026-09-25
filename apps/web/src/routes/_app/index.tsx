import { createFileRoute } from '@tanstack/react-router';
import { isoDateSchema } from '@zeit/shared';
import { z } from 'zod';
import { daysQuery } from '../../features/week/api';
import { addDays, mondayOf } from '../../features/week/dates';
import { WeekPage } from '../../features/week/week-page';
import { todayIso } from '../../lib/dates';

const searchSchema = z.object({ week: isoDateSchema.optional().catch(undefined) });

export const Route = createFileRoute('/_app/')({
	validateSearch: searchSchema,
	loaderDeps: ({ search }) => ({ week: search.week }),
	loader: ({ context, deps, cause }) => {
		const { employeeId } = context.session.user;
		if (!employeeId) return;
		const monday = mondayOf(deps.week ?? todayIso());
		const days = context.queryClient.prefetchQuery(
			daysQuery(employeeId, monday, addDays(monday, 6))
		);
		// a step to another week shows the old one dimmed instead of holding back the click
		return cause === 'stay' ? undefined : days;
	},
	staticData: { title: 'week' },
	component: WeekRoute
});

function WeekRoute() {
	const { session } = Route.useRouteContext();
	const { week } = Route.useSearch();
	return <WeekPage session={session} week={week} />;
}
