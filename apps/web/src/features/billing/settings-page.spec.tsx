import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { describe, expect, it } from 'vitest';
import { server } from '../../mocks/server';
import { renderApp } from '../../test/render-app';
import { signInForBilling } from './testing';

const contactGroup = () => screen.findByRole('group', { name: 'Kontaktperson' });

function signInToSandbox() {
	const session = signInForBilling();
	server.use(
		http.get('/api/auth/session', () =>
			HttpResponse.json({
				...session,
				mode: 'demo',
				tenant: {
					...session.tenant,
					kind: 'sandbox',
					expiresAt: new Date(Date.now() + 3_600_000).toISOString()
				}
			})
		)
	);
}

describe('billing settings', () => {
	it('saves the contact person an XRechnung names', async () => {
		let sent: unknown;
		server.use(
			http.patch('/api/billing/profile', async ({ request }) => {
				sent = await request.clone().json();
			})
		);
		signInForBilling();
		renderApp('/billing/settings');

		const contact = await contactGroup();
		const email = within(contact).getByLabelText('E-Mail');
		expect(email).toHaveValue('buero@musterbetrieb-steuerkanzlei.example');
		await userEvent.type(within(contact).getByLabelText('Name'), 'Mara Lenz');
		await userEvent.type(within(contact).getByLabelText('Telefon'), '0231 447120');
		await userEvent.clear(email);
		await userEvent.type(email, 'Mara@kanzlei.example');
		await userEvent.click(screen.getByRole('button', { name: 'Speichern' }));

		await waitFor(() =>
			expect(sent).toMatchObject({
				contactName: 'Mara Lenz',
				contactPhone: '0231 447120',
				contactEmail: 'mara@kanzlei.example'
			})
		);
		const saved = await screen.findByText('Gespeichert.');
		expect(saved.closest('[role="status"]')).toBeInTheDocument();
		expect(screen.getAllByRole('heading', { name: 'Rechnungssteller' })).toHaveLength(1);
		expect(screen.getByRole('form', { name: 'Rechnungssteller' })).toBeInTheDocument();

		await userEvent.type(email, 'x');
		expect(screen.queryByText('Gespeichert.')).not.toBeInTheDocument();
	});

	it('names a broken contact email and an overlong phone number at the field', async () => {
		signInForBilling();
		renderApp('/billing/settings');

		const contact = await contactGroup();
		const email = within(contact).getByLabelText('E-Mail');
		const phone = within(contact).getByLabelText('Telefon');
		await userEvent.clear(email);
		await userEvent.type(email, 'buero@');
		await userEvent.click(phone);
		await userEvent.paste('+49 231 4471 20 Durchwahl 315 oder 316');
		await userEvent.click(screen.getByRole('button', { name: 'Speichern' }));

		expect(await within(contact).findByText('Keine gültige E-Mail-Adresse')).toBeInTheDocument();
		expect(email).toBeInvalid();
		expect(email).toHaveAccessibleDescription('Keine gültige E-Mail-Adresse');
		expect(phone).toHaveAccessibleDescription('Höchstens 30 Zeichen');
	});

	it('leaves only the tax profile and the previous year revenue open in the demo', async () => {
		let sent: unknown;
		server.use(
			http.patch('/api/billing/profile', async ({ request }) => {
				sent = await request.clone().json();
			})
		);
		signInToSandbox();
		renderApp('/billing/settings');

		expect(
			await screen.findByText(
				'In der Demo lassen sich nur Steuerprofil und Vorjahresumsatz ändern, die übrigen Angaben bleiben fest.'
			)
		).toBeInTheDocument();
		const contact = await contactGroup();
		expect(within(contact).getByLabelText('E-Mail')).toHaveAttribute('readonly');
		expect(screen.getByLabelText('Firmierung')).toHaveAttribute('readonly');
		expect(screen.getByLabelText('IBAN')).toHaveAttribute('readonly');
		expect(screen.getByRole('button', { name: /Standardformat/ })).toBeDisabled();
		expect(screen.getByRole('button', { name: /Rundungsraster/ })).toBeDisabled();

		await userEvent.click(screen.getByRole('button', { name: /Steuerprofil/ }));
		await userEvent.click(
			await screen.findByRole('option', { name: 'Kleinunternehmer (§ 19 UStG)' })
		);
		const revenue = await screen.findByLabelText('Vorjahresumsatz');
		expect(revenue).not.toHaveAttribute('readonly');
		await userEvent.type(revenue, '18000');
		await userEvent.click(screen.getByRole('button', { name: 'Speichern' }));

		await waitFor(() =>
			expect(sent).toMatchObject({
				taxProfile: 'small_business',
				previousYearRevenueCents: '1800000'
			})
		);
	});

	it('names the fields a demo refuses to change instead of a bare refusal', async () => {
		server.use(
			http.patch('/api/billing/profile', () =>
				HttpResponse.json(
					{
						code: 'FORBIDDEN',
						message: 'A sandbox only changes the tax profile and the previous year revenue',
						details: { fields: ['legalName', 'iban', 'bic'] }
					},
					{ status: 403 }
				)
			)
		);
		signInToSandbox();
		renderApp('/billing/settings');
		await contactGroup();

		await userEvent.click(screen.getByRole('button', { name: 'Speichern' }));

		expect(
			await screen.findByText(
				'In der Demo nicht änderbar: Firmierung und Bankverbindung. Nur Steuerprofil und Vorjahresumsatz lassen sich hier ändern.'
			)
		).toBeInTheDocument();
		expect(screen.queryByText('Dafür fehlt die Berechtigung.')).not.toBeInTheDocument();
	});
});
