import { createFileRoute } from '@tanstack/react-router';
import { isoDateSchema, monthSchema, uuidSchema } from '@zeit/shared';
import { z } from 'zod';
import { TimePage } from '../../features/time/time-page';

const searchSchema = z.object({
	month: monthSchema.optional().catch(undefined),
	employee: uuidSchema.optional().catch(undefined),
	day: isoDateSchema.optional().catch(undefined)
});

export const Route = createFileRoute('/_app/time')({
	validateSearch: searchSchema,
	staticData: { title: 'time' },
	component: TimeRoute
});

function TimeRoute() {
	const { session } = Route.useRouteContext();
	const { month, employee, day } = Route.useSearch();
	return <TimePage session={session} month={month} employee={employee} day={day} />;
}
