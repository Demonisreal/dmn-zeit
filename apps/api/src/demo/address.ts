import { isIPv6 } from 'node:net';

// providers hand a whole /64 to one connection, counting single ipv6 addresses would never stop anyone
export function networkOf(ip: string): string {
	// dual-stack sockets report ipv4 clients as ::ffff:a.b.c.d
	const v4 = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/i.exec(ip)?.[1];
	if (v4 || !isIPv6(ip)) return v4 ?? ip;

	// the url parser writes one canonical form: lower case, no leading zeros, ipv4 tails as hex
	const [head = '', tail = ''] = new URL(`http://[${ip}]`).hostname.slice(1, -1).split('::');
	const left = head ? head.split(':') : [];
	const right = tail ? tail.split(':') : [];
	const groups = [...left, ...Array<string>(8 - left.length - right.length).fill('0'), ...right];
	return `${groups.slice(0, 4).join(':')}::/64`;
}
