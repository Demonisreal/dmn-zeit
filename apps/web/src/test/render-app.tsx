import { createMemoryHistory } from '@tanstack/react-router';
import { render } from '@testing-library/react';
import { App } from '../app/app';
import { createAppRouter } from '../app/router';
import { queryClient } from '../lib/api/query-client';

export function renderApp(path: string) {
	const router = createAppRouter(queryClient, createMemoryHistory({ initialEntries: [path] }));
	render(<App queryClient={queryClient} router={router} />);
	return router;
}
