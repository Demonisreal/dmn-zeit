import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { describe, expect, it } from 'vitest';
import { Button } from './button';
import { ConfirmDialog } from './confirm-dialog';

function Lock() {
	const [open, setOpen] = useState(false);
	return (
		<>
			<Button onPress={() => setOpen(true)}>Konto sperren</Button>
			<ConfirmDialog
				isOpen={open}
				onClose={() => setOpen(false)}
				title="Konto sperren?"
				confirmLabel="Sperren"
				onConfirm={() => setOpen(false)}
				isPending={false}
			>
				<p>Die Person kann sich danach nicht mehr anmelden.</p>
			</ConfirmDialog>
		</>
	);
}

describe('ConfirmDialog', () => {
	it('hands focus back to the button that opened it', async () => {
		render(<Lock />);
		const opener = screen.getByRole('button', { name: 'Konto sperren' });

		await userEvent.click(opener);
		await userEvent.click(screen.getByRole('button', { name: 'Abbrechen' }));

		await waitFor(() => expect(opener).toHaveFocus());
	});
});
