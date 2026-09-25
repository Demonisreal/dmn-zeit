import { screen, waitFor, within } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { beforeEach, describe, expect, it } from 'vitest';
import { createSandbox } from '../../lib/api/demo';
import { queryClient, sessionKey } from '../../lib/api/query-client';
import { resetMockDemo } from '../../mocks/demo';
import { mockSession } from '../../mocks/handlers';
import { server } from '../../mocks/server';
import { renderApp } from '../../test/render-app';

describe('outbox', () => {
	beforeEach(async () => {
		resetMockDemo('demo');
		queryClient.setQueryData(sessionKey, await createSandbox({ locale: 'de' }));
	});

	it('lists the mails newest first with recipient and text', async () => {
		renderApp('/demo/outbox');

		const list = await screen.findByRole('list', { name: 'E-Mails im Postausgang' });
		const mails = within(list).getAllByRole('listitem');
		expect(mails.map((mail) => within(mail).getByRole('heading').textContent)).toEqual([
			'Neuer Passkey für DMN Zeit',
			'Hinweis zum Urlaubsverfall: Resturlaub 2026',
			'Urlaub nach Attest zurückgebucht'
		]);
		expect(mails[0]).toHaveTextContent('An jonas.brandt@example.com');
		expect(mails[0]).toHaveTextContent('24.09.2026, 10:03');
		expect(mails[2]).toHaveTextContent('Nach § 9 BUrlG wurden 3 Urlaubstage');
	});

	it('says so while nothing was sent', async () => {
		server.use(http.get('/api/demo/outbox', () => HttpResponse.json([])));
		renderApp('/demo/outbox');

		expect(await screen.findByText('Noch keine E-Mails')).toBeInTheDocument();
		expect(screen.queryByRole('list', { name: 'E-Mails im Postausgang' })).not.toBeInTheDocument();
	});

	it('offers a retry when the outbox cannot be loaded', async () => {
		server.use(
			http.get('/api/demo/outbox', () =>
				HttpResponse.json({ code: 'FORBIDDEN', message: 'No', details: null }, { status: 403 })
			)
		);
		renderApp('/demo/outbox');

		expect(await screen.findByRole('alert')).toHaveTextContent('Das hat nicht geklappt.');
		expect(screen.getByRole('button', { name: 'Erneut versuchen' })).toBeInTheDocument();
	});

	it('sends a live tenant back to the week', async () => {
		queryClient.setQueryData(sessionKey, mockSession);
		const router = renderApp('/demo/outbox');

		await waitFor(() => expect(router.state.location.pathname).toBe('/'));
	});
});
