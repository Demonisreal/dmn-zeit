import { describe, expect, it } from 'vitest';
import { networkOf } from './address';

describe('networkOf', () => {
	it('keeps ipv4 addresses as they are', () => {
		expect(networkOf('203.0.113.7')).toBe('203.0.113.7');
	});

	it('unwraps ipv4 clients of a dual-stack socket', () => {
		expect(networkOf('::ffff:203.0.113.7')).toBe('203.0.113.7');
		expect(networkOf('::FFFF:203.0.113.7')).toBe('203.0.113.7');
	});

	it('cuts ipv6 down to the /64 however the address is written', () => {
		const network = '2001:db8:0:a::/64';
		expect(networkOf('2001:db8:0:a::1')).toBe(network);
		expect(networkOf('2001:0DB8:0000:000A:ffff:1:2:3')).toBe(network);
		expect(networkOf('2001:db8::a:0:0:0:1')).toBe(network);
	});

	it('tells neighbouring /64 networks apart', () => {
		expect(networkOf('2001:db8:0:a::1')).not.toBe(networkOf('2001:db8:0:b::1'));
	});

	it('handles addresses that start with the zero run', () => {
		expect(networkOf('::1')).toBe('0:0:0:0::/64');
	});
});
