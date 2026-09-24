import { createFileRoute } from '@tanstack/react-router';
import { isoDateSchema } from '@zeit/shared';
import { z } from 'zod';
import { WeekPage } from '../../features/week/week-page';

const searchSchema = z.object({ week: isoDateSchema.optional().catch(undefined) });

export const Route = createFileRoute('/_app/')({
	validateSearch: searchSchema,
	staticData: { title: 'week' },
	component: WeekRoute
});

function WeekRoute() {
	const { session } = Route.useRouteContext();
	const { week } = Route.useSearch();
	return <WeekPage session={session} week={week} />;
}
