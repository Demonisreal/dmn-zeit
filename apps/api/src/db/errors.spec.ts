import { DatabaseError } from 'pg';
import { describe, expect, it } from 'vitest';
import { fromDatabase } from './errors';

function pgError(code: string) {
	const error = new DatabaseError('raised by postgres', 0, 'error');
	error.code = code;
	return error;
}

describe('fromDatabase', () => {
	it.each([
		['23P01', 409, 'TIME_OVERLAP'],
		['ZT001', 409, 'PERIOD_LOCKED'],
		['ZT002', 409, 'APPEND_ONLY'],
		['23505', 409, 'ALREADY_EXISTS'],
		['28000', 401, 'UNAUTHENTICATED']
	])('turns %s into %i %s', (sqlState, status, code) => {
		const mapped = fromDatabase(pgError(sqlState));
		expect(mapped?.getStatus()).toBe(status);
		expect(mapped?.getResponse()).toMatchObject({ code, details: null });
	});

	it('keeps the postgres message out of the answer', () => {
		expect(JSON.stringify(fromDatabase(pgError('23505'))?.getResponse())).not.toContain('postgres');
	});

	it('leaves everything else to the 500 path', () => {
		expect(fromDatabase(pgError('42P01'))).toBeUndefined();
		expect(fromDatabase(new DatabaseError('no code', 0, 'error'))).toBeUndefined();
	});
});
