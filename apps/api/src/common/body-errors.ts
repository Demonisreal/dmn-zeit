import { BadRequestException, HttpException, PayloadTooLargeException } from '@nestjs/common';
import type { ApiError } from '@zeit/shared';
import type { NextFunction, Request, Response } from 'express';

type ParserError = Error & { type?: string; status?: number };

// body-parser fails before any route runs; nest would hand a 413 on as an unknown error, so a 500
export function bodyErrors(
	error: ParserError,
	_request: Request,
	_response: Response,
	next: NextFunction
) {
	switch (error.type) {
		case 'entity.too.large':
			return next(
				new PayloadTooLargeException({
					code: 'PAYLOAD_TOO_LARGE',
					message: 'Request body over 100 kB',
					details: null
				} satisfies ApiError)
			);
		case 'entity.parse.failed':
			return next(
				new BadRequestException({
					code: 'VALIDATION',
					message: 'Malformed JSON',
					details: []
				} satisfies ApiError)
			);
		default:
			// unsupported charset or encoding, an aborted upload: the status is meant for the client
			return next(
				error.status && error.status < 500 ? new HttpException(error.message, error.status) : error
			);
	}
}
