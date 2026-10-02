import { Link } from '@tanstack/react-router';
import type { Session } from '@zeit/shared';
import { useTranslation } from 'react-i18next';
import { Tag } from '../../components/ui/tag';
import { formatInstant, formatTime } from '../../i18n/format';
import styles from './demo.module.css';
import { DemoTour } from './demo-tour';

type Props = {
	session: Session;
};

export function DemoBanner({ session }: Props) {
	const { t, i18n } = useTranslation('demo');
	if (session.mode !== 'demo') return null;

	const { expiresAt } = session.tenant;
	const solo = session.tenant.workspace === 'solo';
	return (
		<div className={styles.banner}>
			<Tag>{t('banner.tag')}</Tag>
			<span>
				{expiresAt
					? t(solo ? 'banner.untilSolo' : 'banner.until', {
							day: formatInstant(expiresAt, i18n.language, { day: 'numeric', month: 'long' }),
							time: formatTime(expiresAt, i18n.language)
						})
					: t(solo ? 'banner.soonSolo' : 'banner.soon')}
			</span>
			<Link to="/demo/outbox">{t('banner.outbox')}</Link>
			{expiresAt && (
				<DemoTour
					role={session.user.role}
					workspace={session.tenant.workspace}
					expiresAt={expiresAt}
				/>
			)}
		</div>
	);
}
