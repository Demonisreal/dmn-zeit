import { ArgumentMetadata, BadRequestException, PipeTransform } from '@nestjs/common';
import type { ApiError, FieldIssue } from '@zeit/shared';
import type { core, ZodType } from 'zod';

// the web builds the sentence in the reader's language from code and params
function paramsOf(issue: core.$ZodIssue): FieldIssue['params'] {
	switch (issue.code) {
		case 'too_small':
			return { origin: issue.origin, minimum: Number(issue.minimum) };
		case 'too_big':
			return { origin: issue.origin, maximum: Number(issue.maximum) };
		case 'custom':
			return issue.params;
		default:
			return undefined;
	}
}

function fieldIssue(issue: core.$ZodIssue): FieldIssue {
	const params = paramsOf(issue);
	return {
		field: issue.path.join('.'),
		code: issue.code,
		message: issue.message,
		...(params && { params })
	};
}

export class ZodPipe<T> implements PipeTransform {
	constructor(private readonly schema: ZodType<T>) {}

	transform(value: unknown, _metadata: ArgumentMetadata): T {
		const parsed = this.schema.safeParse(value);
		if (parsed.success) return parsed.data;

		throw new BadRequestException({
			code: 'VALIDATION',
			message: 'Invalid input',
			details: parsed.error.issues.map(fieldIssue)
		} satisfies ApiError);
	}
}
