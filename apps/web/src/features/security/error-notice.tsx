import type { ErrorCode } from '@zeit/shared';
import { useTranslation } from 'react-i18next';
import { errorKey } from '../../app/error-key';
import { Notice } from '../../components/ui/notice';
import { ApiRequestError, hasCode } from '../../lib/api/errors';
import { passkeyCancelled, passkeyExists } from './passkey';

type Props = {
	error: unknown;
	texts?: Partial<Record<ErrorCode, string>>;
};

export function ErrorNotice({ error, texts }: Props) {
	const { t } = useTranslation(['security', 'common']);
	if (hasCode(error, 'REAUTH_REQUIRED')) return null;
	if (passkeyCancelled(error)) return <Notice>{t('passkey.cancelled')}</Notice>;

	const own = error instanceof ApiRequestError ? texts?.[error.code] : undefined;
	return (
		<Notice tone="error">
			{own ?? (passkeyExists(error) ? t('passkey.exists') : t(errorKey(error)))}
		</Notice>
	);
}
