import { setupWorker } from 'msw/browser';
import workerUrl from 'msw/mockServiceWorker.js?url';
import { handlers } from './handlers';

export async function startMockApi() {
	await setupWorker(...handlers).start({
		serviceWorker: { url: workerUrl, options: { scope: '/' } },
		onUnhandledRequest: 'bypass'
	});
}
