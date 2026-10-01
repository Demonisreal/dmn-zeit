import { createHmac, randomBytes, randomUUID } from 'node:crypto';
import type { AppMode } from '@zeit/shared';
import type { Params } from 'nestjs-pino';
import type { SerializedRequest } from 'pino';

const addressKey = randomBytes(32);
const pseudonym = (address: string) =>
	createHmac('sha256', addressKey).update(address).digest('base64url').slice(0, 12);

export function loggerParams(mode: AppMode): Params {
	return {
		pinoHttp: {
			level: mode === 'test' ? 'warn' : 'info',
			genReqId: (_request, response) => {
				const id = randomUUID();
				response.setHeader('X-Request-Id', id);
				return id;
			},
			serializers: {
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
