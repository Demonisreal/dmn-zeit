import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { DayBar } from './day-bar';

describe('DayBar', () => {
	it('describes the entries of the day in words', () => {
		render(
			<DayBar
				spans={[
					{ from: 492, to: 723 },
					{ from: 761, to: 1000, tone: 'running' }
				]}
			/>
		);

		expect(screen.getByRole('img')).toHaveAccessibleName(
			'Buchungen: 08:12 bis 12:03 und seit 12:41'
		);
	});

	it('says when there is nothing', () => {
		render(<DayBar spans={[]} />);

		expect(screen.getByRole('img')).toHaveAccessibleName('Keine Buchungen');
	});
});
