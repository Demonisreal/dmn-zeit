import { shiftMonth } from '../../lib/dates';

// the demo tour still imports these two from here
export { currentMonth, shiftMonth } from '../../lib/dates';

export const monthsBack = (from: string, count: number) =>
	Array.from({ length: count }, (_, i) => shiftMonth(from, -i));
