import { BadRequestException } from '@nestjs/common';
import { instantSchema, uuidSchema, type ApiError } from '@zeit/shared';
import { z } from 'zod';
import type { Cursor } from './time.store';

const cursorSchema = z.tuple([instantSchema, uuidSchema]);

export function encodeCursor(at: string, id: string): string {
	return Buffer.from(`${at}|${id}`).toString('base64url');
}

export function decodeCursor(cursor: string): Cursor {
	const parsed = cursorSchema.safeParse(Buffer.from(cursor, 'base64url').toString().split('|'));
	if (!parsed.success) {
		throw new BadRequestException({
			code: 'VALIDATION',
			message: 'Invalid input',
			details: [{ field: 'cursor', code: 'invalid_format', message: 'Invalid cursor' }]
		} satisfies ApiError);
	}
	const [at, id] = parsed.data;
	return { at, id };
}
