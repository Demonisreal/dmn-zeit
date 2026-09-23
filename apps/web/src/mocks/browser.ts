import { setupWorker } from 'msw/browser';
import workerUrl from 'msw/mockServiceWorker.js?url';
import { handlers } from './handlers';

// the worker comes straight from the package, so public/ and the build never see it
export async function startMockApi() {
	await setupWorker(...handlers).start({
		serviceWorker: { url: workerUrl, options: { scope: '/' } },
		onUnhandledRequest: 'bypass'
	});
}
