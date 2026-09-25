import { HttpException, HttpStatus } from '@nestjs/common';
import type { ApiError, ErrorCode } from '@zeit/shared';
import type { DatabaseError } from 'pg';

// ZT codes come from our own triggers: period lock, append-only, state transitions, sandbox quota
const known: Record<string, [HttpStatus, ErrorCode, string]> = {
	'23P01': [HttpStatus.CONFLICT, 'TIME_OVERLAP', 'Overlaps an existing entry'],
	ZT001: [HttpStatus.CONFLICT, 'PERIOD_LOCKED', 'The month is already closed'],
	ZT002: [HttpStatus.CONFLICT, 'APPEND_ONLY', 'Recorded entries cannot be changed'],
	ZT003: [HttpStatus.CONFLICT, 'INVALID_STATE', 'Not possible in the current state'],
	ZT004: [HttpStatus.CONFLICT, 'INVOICED', 'Already invoiced'],
	ZT005: [
		HttpStatus.CONFLICT,
		'SANDBOX_QUOTA',
		'The demo has reached its limit for this kind of entry'
	],
	'23505': [HttpStatus.CONFLICT, 'ALREADY_EXISTS', 'Already exists'],
	// on insert the referenced row is missing, on delete it is still referenced
	'23503': [HttpStatus.CONFLICT, 'INVALID_STATE', 'Linked record missing or still in use'],
	// a check constraint caught what the zod schema let through
	'23514': [HttpStatus.BAD_REQUEST, 'VALIDATION', 'Invalid input'],
	// a function refused its arguments, e.g. a team calendar over too many days
	'22023': [HttpStatus.BAD_REQUEST, 'VALIDATION', 'Invalid input'],
	// row level security refused a write, or a guard trigger did
	'42501': [HttpStatus.FORBIDDEN, 'FORBIDDEN', 'Not allowed'],
	'28000': [HttpStatus.UNAUTHORIZED, 'UNAUTHENTICATED', 'Not signed in']
};

export function fromDatabase(error: DatabaseError): HttpException | undefined {
	const hit = error.code ? known[error.code] : undefined;
	if (!hit) return undefined;

	const [status, code, message] = hit;
	const body: ApiError =
		code === 'VALIDATION' ? { code, message, details: [] } : { code, message, details: null };
	return new HttpException(body, status);
}
