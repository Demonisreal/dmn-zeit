import '@testing-library/jest-dom/vitest';
import { cleanup, configure } from '@testing-library/react';
import { afterAll, afterEach, beforeAll, beforeEach } from 'vitest';
import { i18n } from '../i18n';
import { queryClient } from '../lib/api/query-client';
import { resetMockAbsences } from '../mocks/absences';
import { resetMockAdmin } from '../mocks/admin';
import { resetMockBilling } from '../mocks/billing';
import { resetMockSession } from '../mocks/handlers';
import { resetMockHr } from '../mocks/hr';
import { resetMockProjects } from '../mocks/projects';
import { resetMockSecurity } from '../mocks/security';
import { server } from '../mocks/server';
import { resetMockWeek } from '../mocks/week';

// jsdom cannot scroll, the router still resets the scroll position on every navigation
window.scrollTo = () => {};
Element.prototype.scrollIntoView = () => {};
URL.createObjectURL = () => 'blob:pdf';
URL.revokeObjectURL = () => {};

// jsdom has no media queries, the specs run as a wide screen with a mouse
window.matchMedia = (query: string) =>
	({
		matches: false,
		media: query,
		onchange: null,
		addEventListener: () => {},
		removeEventListener: () => {},
		addListener: () => {},
		removeListener: () => {},
		dispatchEvent: () => false
	}) satisfies MediaQueryList;

// with many workers the lazy route chunks load cold, the default 1000ms findBy timeout is too tight
configure({ asyncUtilTimeout: 3000 });

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));

// the routes load these on the way in, the specs also render pages without a router
beforeAll(() => i18n.loadNamespaces(['hr', 'admin', 'security', 'demo']));

// jsdom reports en-US, the assertions are written against the German texts
beforeEach(() => i18n.changeLanguage('de'));

afterEach(() => {
	cleanup();
	server.resetHandlers();
	queryClient.clear();
	resetMockSession();
	resetMockSecurity();
	resetMockWeek();
	resetMockProjects();
	resetMockBilling();
	resetMockAbsences();
	resetMockHr();
	resetMockAdmin();
});

afterAll(() => server.close());
