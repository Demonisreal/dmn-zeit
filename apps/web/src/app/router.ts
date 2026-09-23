import type { QueryClient } from '@tanstack/react-query';
import { createBrowserHistory, createRouter, type RouterHistory } from '@tanstack/react-router';
import type { resources } from '../i18n';
import { routeTree } from '../routeTree.gen';

export function createAppRouter(
	queryClient: QueryClient,
	history: RouterHistory = createBrowserHistory()
) {
	return createRouter({ routeTree, history, context: { queryClient } });
}

declare module '@tanstack/react-router' {
	interface Register {
		router: ReturnType<typeof createAppRouter>;
	}

	interface StaticDataRouteOption {
		title?: keyof (typeof resources)['de']['nav'];
	}
}
