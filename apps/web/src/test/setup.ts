import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterAll, afterEach, beforeAll, beforeEach } from 'vitest';
import { i18n } from '../i18n';
import { queryClient } from '../lib/api/query-client';
import { resetMockSession } from '../mocks/handlers';
import { server } from '../mocks/server';

// jsdom cannot scroll, the router still resets the scroll position on every navigation
window.scrollTo = () => {};

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));

// jsdom reports en-US, the assertions are written against the German texts
beforeEach(() => i18n.changeLanguage('de'));

afterEach(() => {
	cleanup();
	server.resetHandlers();
	queryClient.clear();
	resetMockSession();
});

afterAll(() => server.close());
