import { ArgumentMetadata, BadRequestException, PipeTransform } from '@nestjs/common';
import type { ApiError } from '@zeit/shared';
import type { ZodType } from 'zod';

export class ZodPipe<T> implements PipeTransform {
	constructor(private readonly schema: ZodType<T>) {}

	transform(value: unknown, _metadata: ArgumentMetadata): T {
		const parsed = this.schema.safeParse(value);
		if (parsed.success) return parsed.data;

		const details = parsed.error.issues.map((issue) => ({
			field: issue.path.join('.'),
			message: issue.message
		}));
		throw new BadRequestException({
			code: 'VALIDATION',
			message: 'Invalid input',
			details
		} satisfies ApiError);
	}
}
