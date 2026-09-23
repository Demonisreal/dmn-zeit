import type { ApiError, ErrorCode } from '@zeit/shared';

export class ApiRequestError extends Error {
	readonly status: number;
	readonly code: ErrorCode;
	readonly details: ApiError['details'];

	constructor(status: number, body: ApiError) {
		super(body.message);
		this.name = 'ApiRequestError';
		this.status = status;
		this.code = body.code;
		this.details = body.details;
	}
}

export function hasCode(err: unknown, code: ErrorCode): err is ApiRequestError {
	return err instanceof ApiRequestError && err.code === code;
}
