import { notImplemented } from './stub';

// vacation days are kept exact, a float would lose hundredths on every conversion
export type Fraction = {
	readonly num: number;
	readonly den: number;
};

export const fraction: (num: number, den?: number) => Fraction = notImplemented;
export const parseDecimal: (text: string) => Fraction = notImplemented;
export const toDecimal: (value: Fraction, places: number) => string = notImplemented;
