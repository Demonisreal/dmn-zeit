import type { QueryClient } from '@tanstack/react-query';
import { createRootRouteWithContext, Outlet, useRouterState } from '@tanstack/react-router';
import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { NotFound, RouteError } from '../app/fallback';

type RouterContext = {
	queryClient: QueryClient;
};

export const Route = createRootRouteWithContext<RouterContext>()({
	component: Root,
	notFoundComponent: NotFound,
	errorComponent: RouteError
});

function Root() {
	const { t } = useTranslation('nav');
	const title = useRouterState({ select: (state) => state.matches.at(-1)?.staticData.title });

	useEffect(() => {
		document.title = title ? `${t(title)} · DMN Zeit` : 'DMN Zeit';
	}, [t, title]);

	return <Outlet />;
}
