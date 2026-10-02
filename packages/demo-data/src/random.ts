export class Random {
	private state: number;

	constructor(seed: number) {
		let hash = 0x811c9dc5;
		for (const char of String(seed)) {
			hash = Math.imul(hash ^ char.charCodeAt(0), 0x01000193);
		}
		this.state = hash >>> 0;
	}

	uint32(): number {
		this.state = (this.state + 0x6d2b79f5) | 0;
		let t = this.state;
		t = Math.imul(t ^ (t >>> 15), t | 1);
		t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
		return (t ^ (t >>> 14)) >>> 0;
	}

	int(min: number, max: number): number {
		return min + Math.floor((this.uint32() / 2 ** 32) * (max - min + 1));
	}

	pick<T>(list: readonly T[]): T {
		return list[this.int(0, list.length - 1)]!;
	}

	shuffle<T>(list: readonly T[]): T[] {
		const copy = [...list];
		for (let i = copy.length - 1; i > 0; i--) {
			const j = this.int(0, i);
			[copy[i], copy[j]] = [copy[j]!, copy[i]!];
		}
		return copy;
	}

	uuid(): string {
		const hex = Array.from({ length: 4 }, () => this.uint32().toString(16).padStart(8, '0')).join(
			''
		);
		const variant = ((parseInt(hex[16]!, 16) & 0x3) | 0x8).toString(16);
		return [
			hex.slice(0, 8),
			hex.slice(8, 12),
			`4${hex.slice(13, 16)}`,
			`${variant}${hex.slice(17, 20)}`,
			hex.slice(20)
		].join('-');
	}
}
