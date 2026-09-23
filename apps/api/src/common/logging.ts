import { randomUUID } from 'node:crypto';
import type { AppMode } from '@zeit/shared';
import type { Params } from 'nestjs-pino';

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
