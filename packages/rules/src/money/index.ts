const abs = (n: bigint) => (n < 0n ? -n : n);

export const roundDiv = (num: bigint, den: bigint): bigint => {
	const quotient = num / den;
	if (2n * abs(num % den) < abs(den)) {
		return quotient;
	}
	return num < 0n !== den < 0n ? quotient - 1n : quotient + 1n;
};

export const percentOf = (cents: bigint, basisPoints: number): bigint =>
	roundDiv(cents * BigInt(basisPoints), 10000n);

const EUROS = /^(-?)(\d+)(?:\.(\d{1,2}))?$/;

export const parseCents = (text: string): bigint => {
	const match = EUROS.exec(text.trim());
	if (!match) {
		throw new Error(`parseCents: not a euro amount with at most two decimals: ${text}`);
	}
	const whole = match[2]!;
	const decimals = (match[3] ?? '').padEnd(2, '0');
	const cents = BigInt(whole) * 100n + BigInt(decimals);
	return match[1] === '-' ? -cents : cents;
};
