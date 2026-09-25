import './styles/tokens.css';
import './styles/base.css';
import { i18nReady } from './i18n';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './app/app';
import { createAppRouter } from './app/router';
import { sessionQuery } from './lib/api/auth';
import { queryClient } from './lib/api/query-client';

async function start() {
	// VITE_MSW=on answers /api from the mocks, the check on DEV drops the import from every build
	if (import.meta.env.DEV && import.meta.env.VITE_MSW === 'on') {
		const { startMockApi } = await import('./mocks/browser');
		await startMockApi();
	}

	// every page starts with the session, the request need not wait for the first render
	void queryClient.prefetchQuery(sessionQuery);
	// English comes as chunks, rendering before them would only suspend
	await i18nReady;

	createRoot(document.getElementById('app')!).render(
		<StrictMode>
			<App queryClient={queryClient} router={createAppRouter(queryClient)} />
		</StrictMode>
	);
}

void start();
