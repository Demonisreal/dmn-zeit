import { createFileRoute } from '@tanstack/react-router';
import { monthSchema, uuidSchema } from '@zeit/shared';
import { z } from 'zod';
import { TimePage } from '../../features/time/time-page';

// employee lets the inbox or the team calendar open someone else's month
const searchSchema = z.object({
	month: monthSchema.optional().catch(undefined),
	employee: uuidSchema.optional().catch(undefined)
});

export const Route = createFileRoute('/_app/time')({
	validateSearch: searchSchema,
	staticData: { title: 'time' },
	component: TimeRoute
});

function TimeRoute() {
	const { session } = Route.useRouteContext();
	const { month, employee } = Route.useSearch();
	return <TimePage session={session} month={month} employee={employee} />;
}
