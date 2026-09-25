import type { QueryClient } from '@tanstack/react-query';
import { createBrowserHistory, createRouter, type RouterHistory } from '@tanstack/react-router';
import type { Resources } from '../i18n';
import { routeTree } from '../routeTree.gen';

export function createAppRouter(
	queryClient: QueryClient,
	history: RouterHistory = createBrowserHistory()
) {
	return createRouter({
		routeTree,
		history,
		context: { queryClient },
		defaultPreload: 'intent'
	});
}

declare module '@tanstack/react-router' {
	interface Register {
		router: ReturnType<typeof createAppRouter>;
	}

	interface StaticDataRouteOption {
		title?: keyof Resources['nav'];
	}
}
