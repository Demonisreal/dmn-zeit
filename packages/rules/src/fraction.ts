export type Fraction = {
	readonly num: number;
	readonly den: number;
};

const gcd = (a: number, b: number): number => (b === 0 ? a : gcd(b, a % b));

export const fraction = (num: number, den = 1): Fraction => {
	if (!Number.isInteger(num) || !Number.isInteger(den)) {
		throw new Error(`fraction: num and den must be integers, got ${num}/${den}`);
	}
	if (den === 0) {
		throw new Error('fraction: denominator is zero');
	}
	const sign = den < 0 ? -1 : 1;
	const n = num * sign;
	const d = den * sign;
	const divisor = gcd(Math.abs(n), d) || 1;
	return { num: n / divisor, den: d / divisor };
};

const DECIMAL = /^(-?)(\d+)(?:\.(\d+))?$/;

export const parseDecimal = (text: string): Fraction => {
	const match = DECIMAL.exec(text.trim());
	if (!match) {
		throw new Error(`parseDecimal: not a decimal number: ${text}`);
	}
	const sign = match[1] === '-' ? -1 : 1;
	const whole = match[2] ?? '0';
	const decimals = match[3] ?? '';
	const den = 10 ** decimals.length;
	const num = Number(whole) * den + Number(decimals || '0');
	return fraction(sign * num, den);
};

export const toDecimal = (value: Fraction, places: number): string => {
	const scale = 10 ** places;
	const scaled = Math.round((value.num / value.den) * scale);
	const sign = scaled < 0 ? '-' : '';
	const digits = Math.abs(scaled)
		.toString()
		.padStart(places + 1, '0');
	if (places === 0) {
		return sign + digits;
	}
	return `${sign}${digits.slice(0, -places)}.${digits.slice(-places)}`;
};

export const add = (a: Fraction, b: Fraction): Fraction =>
	fraction(a.num * b.den + b.num * a.den, a.den * b.den);
export const subtract = (a: Fraction, b: Fraction): Fraction => add(a, fraction(-b.num, b.den));
export const multiply = (a: Fraction, b: Fraction): Fraction =>
	fraction(a.num * b.num, a.den * b.den);
export const compare = (a: Fraction, b: Fraction): number => a.num * b.den - b.num * a.den;
export const min = (a: Fraction, b: Fraction): Fraction => (compare(a, b) <= 0 ? a : b);
export const max = (a: Fraction, b: Fraction): Fraction => (compare(a, b) >= 0 ? a : b);
export const isZero = (a: Fraction): boolean => a.num === 0;
export const isNegative = (a: Fraction): boolean => a.num < 0;
export const negate = (a: Fraction): Fraction => fraction(-a.num, a.den);
export const floor = (a: Fraction): number => Math.floor(a.num / a.den);
export const fractionalPart = (a: Fraction): Fraction => subtract(a, fraction(floor(a)));
