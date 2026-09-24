import { startRegistration } from '@simplewebauthn/browser';
import type { Session } from '@zeit/shared';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { queryClient, sessionKey } from '../../lib/api/query-client';
import { mockSession } from '../../mocks/handlers';
import {
	mockAttestation,
	mockTotpCode,
	resetMockSecurity,
	securityHandlers
} from '../../mocks/security';
import { server } from '../../mocks/server';
import { renderApp } from '../../test/render-app';

vi.mock('@simplewebauthn/browser', () => ({
	browserSupportsWebAuthn: () => true,
	startAuthentication: vi.fn(),
	startRegistration: vi.fn()
}));

const shownCodes = () =>
	within(screen.getByRole('list', { name: 'Wiederherstellungscodes' }))
		.getAllByRole('listitem')
		.map((row) => row.textContent);

describe('setting up the second factor', () => {
	beforeEach(() => {
		resetMockSecurity('none');
		server.use(...securityHandlers);
		queryClient.setQueryData(sessionKey, {
			...mockSession,
			security: { enrollmentPending: true, reauthUntil: null }
		});
	});

	it('sets up the authenticator app from a qr image and ends the setup state', async () => {
		const router = renderApp('/security/setup');
		await screen.findByRole('heading', { name: 'Zweiten Faktor einrichten' });

		await userEvent.click(screen.getByRole('button', { name: 'Authenticator-App einrichten' }));

		const qr = await screen.findByRole('img', {
			name: 'QR-Code zum Einrichten der Authenticator-App'
		});
		const [prefix, encoded] = qr.getAttribute('src')!.split(',');
		expect(prefix).toBe('data:image/svg+xml;base64');
		expect(atob(encoded!)).toMatch(/^<svg /);
		expect(qr.closest('form')!.querySelector('svg')).toBeNull();
		expect(screen.getByText('JBSW Y3DP EHPK 3PXP JBSW Y3DP EHPK 3PXP')).toBeInTheDocument();

		const code = screen.getByLabelText('Code aus der App');
		await userEvent.type(code, '000000');
		await userEvent.click(screen.getByRole('button', { name: 'Bestätigen' }));
		expect(await screen.findByText(/Der Code stimmt nicht/)).toBeInTheDocument();
		expect(code).toHaveAttribute('aria-invalid', 'true');

		await userEvent.clear(code);
		await userEvent.type(code, mockTotpCode);
		await userEvent.click(screen.getByRole('button', { name: 'Bestätigen' }));

		expect(
			await screen.findByRole('heading', { name: 'Wiederherstellungscodes' })
		).toBeInTheDocument();
		expect(shownCodes()).toHaveLength(10);

		await userEvent.click(screen.getByRole('checkbox', { name: /Codes an einem sicheren Ort/ }));
		await userEvent.click(screen.getByRole('button', { name: 'Weiter' }));

		await waitFor(() => expect(router.state.location.pathname).toBe('/'));
		expect(queryClient.getQueryData<Session>(sessionKey)?.security.enrollmentPending).toBe(false);
	});

	it('registers a passkey and hands out the codes with copy and download', async () => {
		vi.mocked(startRegistration).mockResolvedValueOnce(mockAttestation);
		const createObjectURL = vi.fn((_blob: Blob) => 'blob:codes');
		URL.createObjectURL = createObjectURL;
		URL.revokeObjectURL = vi.fn();
		const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
		const user = userEvent.setup();
		renderApp('/security/setup');

		const name = await screen.findByLabelText('Name');
		await user.clear(name);
		await user.type(name, 'Laptop Büro');
		await user.click(screen.getByRole('button', { name: 'Passkey erstellen' }));

		await screen.findByRole('heading', { name: 'Wiederherstellungscodes' });
		const codes = shownCodes();
		expect(codes).toHaveLength(10);
		const next = screen.getByRole('button', { name: 'Weiter' });
		expect(next).toBeDisabled();

		await user.click(screen.getByRole('button', { name: 'Kopieren' }));
		expect(await navigator.clipboard.readText()).toBe(codes.join('\n'));
		expect(screen.getByRole('button', { name: 'Kopiert' })).toBeInTheDocument();

		await user.click(screen.getByRole('button', { name: 'Als Textdatei speichern' }));
		expect(click).toHaveBeenCalledOnce();
		expect((click.mock.contexts[0] as HTMLAnchorElement).download).toBe(
			'dmn-zeit-wiederherstellungscodes.txt'
		);
		const file = await createObjectURL.mock.calls[0]![0].text();
		expect(file).toMatch(/^DMN Zeit, Wiederherstellungscodes vom /);
		for (const code of codes) expect(file).toContain(code);

		expect(next).toBeDisabled();
		await user.click(screen.getByRole('checkbox', { name: /Codes an einem sicheren Ort/ }));
		expect(next).toBeEnabled();
		click.mockRestore();
	});

	it('leaves a closed passkey prompt without changes', async () => {
		vi.mocked(startRegistration).mockRejectedValueOnce(
			Object.assign(new Error('Not allowed'), { name: 'NotAllowedError' })
		);
		renderApp('/security/setup');

		await userEvent.type(await screen.findByLabelText('Name'), 'Laptop');
		await userEvent.click(screen.getByRole('button', { name: 'Passkey erstellen' }));

		expect(await screen.findByText('Passkey-Abfrage abgebrochen.')).toBeInTheDocument();
		expect(screen.getByRole('heading', { name: 'Zweiten Faktor einrichten' })).toBeInTheDocument();
	});
});
