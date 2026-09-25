import { IncomingMessage, ServerResponse } from 'node:http';
import { Socket } from 'node:net';
import { Writable } from 'node:stream';
import { pinoHttp, type Options } from 'pino-http';
import { describe, expect, it } from 'vitest';
import { loggerParams } from './logging';

describe('loggerParams', () => {
	it('writes neither the proxy nor the visitor behind it in full', () => {
		let line = '';
		const out = new Writable({
			write(chunk: Buffer, _encoding, done) {
				line += chunk.toString();
				done();
			}
		});
		const socket = new Socket();
		Object.defineProperty(socket, 'remoteAddress', { value: '172.28.2.5' });
		const request = new IncomingMessage(socket);
		Object.assign(request, {
			method: 'GET',
			url: '/api/health',
			headers: { 'x-forwarded-for': '203.0.113.7', host: 'zeit.test' }
		});

		pinoHttp(loggerParams('live').pinoHttp as Options, out)(request, new ServerResponse(request));
		request.log.info('probe');

		expect(line).not.toContain('172.28.2');
		expect(line).not.toContain('203.0.113');
		expect(JSON.parse(line).req).toMatchObject({
			method: 'GET',
			headers: { host: 'zeit.test', 'x-forwarded-for': expect.any(String) },
			remoteAddress: expect.any(String)
		});
	});
});
