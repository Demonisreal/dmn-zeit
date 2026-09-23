import { passwordSchema } from '@zeit/shared';
import { z } from 'zod';
import { i18n } from '../../i18n';
import { hasCode } from '../../lib/api/errors';

export const newPasswordSchema = z
	.object({ password: passwordSchema, confirm: z.string().min(1) })
	.refine((values) => values.password === values.confirm, {
		path: ['confirm'],
		error: () => i18n.t('mismatch', { ns: 'auth' })
	});

// length is checked here already, what the server still refuses is a password from its common list
export const rejectsPassword = (err: unknown) =>
	hasCode(err, 'VALIDATION') &&
	Array.isArray(err.details) &&
	err.details.some((issue) => issue.field === 'password');
