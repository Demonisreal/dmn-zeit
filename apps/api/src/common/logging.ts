import { createHmac, randomBytes, randomUUID } from 'node:crypto';
import type { AppMode } from '@zeit/shared';
import type { Params } from 'nestjs-pino';
import type { SerializedRequest } from 'pino';

// a bare hash of an ipv4 address is reversed in minutes, the key dies with the process
const addressKey = randomBytes(32);
const pseudonym = (address: string) =>
	createHmac('sha256', addressKey).update(address).digest('base64url').slice(0, 12);

export function loggerParams(mode: AppMode): Params {
	return {
		pinoHttp: {
			level: mode === 'test' ? 'warn' : 'info',
			// app.request_id in the database is a uuid, so the id is never taken from the client
			genReqId: (_request, response) => {
				const id = randomUUID();
				response.setHeader('X-Request-Id', id);
				return id;
			},
			serializers: {
				// behind caddy the socket only knows the proxy, the visitor stands in x-forwarded-for
				req: (req: SerializedRequest) => {
					const forwarded = req.headers['x-forwarded-for'];
					return {
						...req,
						remoteAddress: req.remoteAddress && pseudonym(req.remoteAddress),
						headers: forwarded
							? { ...req.headers, 'x-forwarded-for': pseudonym(forwarded) }
							: req.headers
					};
				}
			},
			redact: {
				paths: [
					'req.headers.cookie',
					'req.headers["x-csrf-token"]',
					'res.headers["set-cookie"]',
					'*.password',
					'*.currentPassword',
					'*.newPassword',
					'*.token',
					'*.csrfToken'
				],
				censor: '[redacted]'
			}
		}
	};
}
