import { shiftMonth } from '../../lib/dates';

export { currentMonth, shiftMonth } from '../../lib/dates';

export const monthsBack = (from: string, count: number) =>
	Array.from({ length: count }, (_, i) => shiftMonth(from, -i));
