import { Link } from '@tanstack/react-router';
import { hasRole, type Role } from '@zeit/shared';
import { useTranslation } from 'react-i18next';
import styles from './main-nav.module.css';

const entries = [
	{ to: '/', label: 'week', role: 'employee' },
	{ to: '/absences', label: 'requests', role: 'employee' },
	{ to: '/vacation', label: 'vacation', role: 'employee' },
	{ to: '/team/calendar', label: 'team', role: 'team_lead' },
	{ to: '/hr', label: 'hr', role: 'hr' },
	{ to: '/admin', label: 'admin', role: 'admin' }
] as const;

type Props = {
	role: Role;
	onNavigate: () => void;
};

export function MainNav({ role, onNavigate }: Props) {
	const { t } = useTranslation('nav');
	return (
		<ul className={styles.list}>
			{entries
				.filter((entry) => hasRole(role, entry.role))
				.map((entry) => (
					<li key={entry.to}>
						<Link
							to={entry.to}
							activeOptions={{ exact: entry.to === '/' }}
							className={styles.link}
							onClick={onNavigate}
						>
							{t(entry.label)}
						</Link>
					</li>
				))}
		</ul>
	);
}
