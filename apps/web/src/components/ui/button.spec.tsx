import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { Button } from './button';

describe('Button', () => {
	it('fires on click and on the keyboard', async () => {
		const onPress = vi.fn();
		render(<Button onPress={onPress}>Stempeln</Button>);

		await userEvent.click(screen.getByRole('button', { name: 'Stempeln' }));
		await userEvent.keyboard('{Enter}');

		expect(onPress).toHaveBeenCalledTimes(2);
	});

	it('marks keyboard focus, not mouse focus', async () => {
		render(<Button>Stempeln</Button>);
		const button = screen.getByRole('button');

		await userEvent.click(button);
		expect(button).not.toHaveAttribute('data-focus-visible');

		await userEvent.tab();
		await userEvent.tab({ shift: true });
		expect(button).toHaveFocus();
		expect(button).toHaveAttribute('data-focus-visible');
	});

	it('does nothing while disabled', async () => {
		const onPress = vi.fn();
		render(
			<Button isDisabled onPress={onPress}>
				Stempeln
			</Button>
		);

		await userEvent.click(screen.getByRole('button'));

		expect(screen.getByRole('button')).toBeDisabled();
		expect(onPress).not.toHaveBeenCalled();
	});

	it('stays focusable but ignores presses while pending', async () => {
		const onPress = vi.fn();
		render(
			<Button variant="primary" isPending onPress={onPress}>
				Anmelden
			</Button>
		);
		const button = screen.getByRole('button', { name: 'Anmelden' });

		await userEvent.click(button);
		await userEvent.keyboard('{Enter}');

		expect(onPress).not.toHaveBeenCalled();
		expect(button).toHaveAttribute('data-pending', 'true');
		expect(button).toHaveAttribute('aria-disabled', 'true');
		expect(button).not.toBeDisabled();
	});
});
