import { Link } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { Notice } from '../components/ui/notice';
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

export function RouteError() {
	const { t } = useTranslation();
	return (
		<PublicLayout>
			<Notice tone="error">{t('errors.unexpected')}</Notice>
		</PublicLayout>
	);
}
