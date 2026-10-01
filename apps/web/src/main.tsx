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
	if (import.meta.env.DEV && import.meta.env.VITE_MSW === 'on') {
		const { startMockApi } = await import('./mocks/browser');
		await startMockApi();
	}

	void queryClient.prefetchQuery(sessionQuery);
	await i18nReady;

	createRoot(document.getElementById('app')!).render(
		<StrictMode>
			<App queryClient={queryClient} router={createAppRouter(queryClient)} />
		</StrictMode>
	);
}

void start();
