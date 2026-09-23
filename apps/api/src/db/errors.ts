import { HttpException, HttpStatus } from '@nestjs/common';
import type { ApiError, ErrorCode } from '@zeit/shared';
import type { DatabaseError } from 'pg';

// ZT001 and ZT002 are raised by our own triggers, see enforce_period_lock and reject_change
const known: Record<string, [HttpStatus, Exclude<ErrorCode, 'VALIDATION'>, string]> = {
	'23P01': [HttpStatus.CONFLICT, 'TIME_OVERLAP', 'Overlaps an existing entry'],
	ZT001: [HttpStatus.CONFLICT, 'PERIOD_LOCKED', 'The month is already closed'],
	ZT002: [HttpStatus.CONFLICT, 'APPEND_ONLY', 'Recorded entries cannot be changed'],
	'23505': [HttpStatus.CONFLICT, 'ALREADY_EXISTS', 'Already exists'],
	'28000': [HttpStatus.UNAUTHORIZED, 'UNAUTHENTICATED', 'Not signed in']
};

export function fromDatabase(error: DatabaseError): HttpException | undefined {
	const hit = error.code ? known[error.code] : undefined;
	if (!hit) return undefined;

	const [status, code, message] = hit;
	return new HttpException({ code, message, details: null } satisfies ApiError, status);
}
