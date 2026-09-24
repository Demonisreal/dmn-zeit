import type { ErrorCode } from '@zeit/shared';
import { useTranslation } from 'react-i18next';
import { errorKey } from '../../app/error-key';
import { Notice } from '../../components/ui/notice';
import { ApiRequestError, hasCode } from '../../lib/api/errors';
import { passkeyCancelled, passkeyExists } from './passkey';

type Props = {
	error: unknown;
	// wording for codes that mean something specific at this spot, e.g. a wrong code
	texts?: Partial<Record<ErrorCode, string>>;
};

export function ErrorNotice({ error, texts }: Props) {
	const { t } = useTranslation(['security', 'common']);
	// the step-up dialog opens instead, a message behind it would only repeat it
	if (hasCode(error, 'REAUTH_REQUIRED')) return null;
	if (passkeyCancelled(error)) return <Notice>{t('passkey.cancelled')}</Notice>;

	const own = error instanceof ApiRequestError ? texts?.[error.code] : undefined;
	return (
		<Notice tone="error">
			{own ?? (passkeyExists(error) ? t('passkey.exists') : t(errorKey(error)))}
		</Notice>
	);
}
