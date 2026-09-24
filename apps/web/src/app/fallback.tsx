import { Link, useRouter, type ErrorComponentProps } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { Button } from '../components/ui/button';
import { Notice } from '../components/ui/notice';
import { errorKey } from './error-key';
import { PublicLayout } from './public-layout';

export function NotFound() {
	const { t } = useTranslation();
	return (
		<PublicLayout>
			<h1>{t('notFound')}</h1>
			<p>
				<Link to="/">{t('toStart')}</Link>
			</p>
		</PublicLayout>
	);
}

export function RouteError({ error, reset }: ErrorComponentProps) {
	const { t } = useTranslation(['common']);
	const router = useRouter();
	return (
		<PublicLayout>
			<h1>{t('loadFailed')}</h1>
			<Notice
				tone="error"
				action={
					<Button
						variant="secondary"
						onPress={() => {
							reset();
							void router.invalidate();
						}}
					>
						{t('retry')}
					</Button>
				}
			>
				{t(errorKey(error))}
			</Notice>
		</PublicLayout>
	);
}
