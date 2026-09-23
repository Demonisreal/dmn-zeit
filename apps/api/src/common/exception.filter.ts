import { ArgumentsHost, Catch, ExceptionFilter, HttpException, Logger } from '@nestjs/common';
import { apiErrorSchema, type ApiError, type ErrorCode } from '@zeit/shared';
import type { Response } from 'express';
import { DatabaseError } from 'pg';
import { fromDatabase } from '../db/errors';

const codeByStatus: Partial<Record<number, ErrorCode>> = {
	400: 'VALIDATION',
	401: 'UNAUTHENTICATED',
	403: 'FORBIDDEN',
	404: 'NOT_FOUND',
	409: 'INVALID_STATE',
	413: 'VALIDATION',
	429: 'RATE_LIMITED'
};

export function toApiError(exception: unknown): { status: number; body: ApiError } | undefined {
	const http = exception instanceof DatabaseError ? fromDatabase(exception) : exception;
	if (!(http instanceof HttpException)) return undefined;

	const status = http.getStatus();
	const parsed = apiErrorSchema.safeParse(http.getResponse());
	if (parsed.success) return { status, body: parsed.data };
	if (status >= 500) return undefined;

	// nest's own exceptions (unknown route, throttler) carry no code, the status tells it
	const code = codeByStatus[status] ?? 'INVALID_STATE';
	const body: ApiError =
		code === 'VALIDATION'
			? { code, message: http.message, details: [] }
			: { code, message: http.message, details: null };
	return { status, body };
}

@Catch()
export class ApiExceptionFilter implements ExceptionFilter {
	private readonly logger = new Logger('Exceptions');

	catch(exception: unknown, host: ArgumentsHost) {
		const response = host.switchToHttp().getResponse<Response>();
		const known = toApiError(exception);
		if (known) {
			response.status(known.status).json(known.body);
			return;
		}

		this.logger.error(exception);
		response
			.status(500)
			.json({ code: 'INTERNAL', message: 'Internal error', details: null } satisfies ApiError);
	}
}
