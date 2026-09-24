import { useTranslation } from 'react-i18next';
import { errorKey } from '../../app/error-key';
import { ApiRequestError } from '../../lib/api/errors';

const known = {
	ALREADY_EXISTS: 'alreadyExists',
	INVALID_STATE: 'invalidState',
	PERIOD_LOCKED: 'periodLocked',
	FORBIDDEN: 'forbidden',
	NOT_FOUND: 'notFound',
	VALIDATION: 'validation',
	REAUTH_REQUIRED: 'reauthRequired'
} as const;

const isKnown = (code: string): code is keyof typeof known => code in known;

export function useErrorText() {
	const { t } = useTranslation(['hr', 'common']);
	return (err: unknown) =>
		err instanceof ApiRequestError && isKnown(err.code)
			? t(`hr:errors.${known[err.code]}`)
			: t(errorKey(err));
}
