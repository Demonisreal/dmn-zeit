import { isIPv6 } from 'node:net';

export function networkOf(ip: string): string {
	const v4 = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/i.exec(ip)?.[1];
	if (v4 || !isIPv6(ip)) return (v4 ?? ip).replace(/\.\d+$/, '.0/24');

	const [head = '', tail = ''] = new URL(`http://[${ip}]`).hostname.slice(1, -1).split('::');
	const left = head ? head.split(':') : [];
	const right = tail ? tail.split(':') : [];
	const groups = [...left, ...Array<string>(8 - left.length - right.length).fill('0'), ...right];
	return `${groups.slice(0, 4).join(':')}::/64`;
}
