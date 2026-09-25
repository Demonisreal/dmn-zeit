import { Link, useRouterState, type LinkProps } from '@tanstack/react-router';
import { hasRole, type Role, type WorkspaceKind } from '@zeit/shared';
import { useTranslation } from 'react-i18next';
import type { Resources } from '../i18n';
import styles from './main-nav.module.css';

type Entry = {
	to: NonNullable<LinkProps['to']>;
	label: keyof Resources['nav'];
	role: Role;
	// without it the entry shows in both workspaces
	workspace?: WorkspaceKind;
	// detail pages that live outside the entry's own path but belong to it
	match?: string;
};

const entries: Entry[] = [
	{ to: '/', label: 'week', role: 'employee' },
	{ to: '/time', label: 'time', role: 'employee', workspace: 'company' },
	{ to: '/absences', label: 'requests', role: 'employee', workspace: 'company' },
	{ to: '/vacation', label: 'vacation', role: 'employee', workspace: 'company' },
	{ to: '/projects', label: 'projects', role: 'employee', workspace: 'company' },
	{ to: '/inbox', label: 'inbox', role: 'team_lead', workspace: 'company' },
	{ to: '/team/calendar', label: 'team', role: 'team_lead', workspace: 'company' },
	{ to: '/team/projects', label: 'teamProjects', role: 'team_lead', workspace: 'company' },
	{ to: '/hr', label: 'hr', role: 'hr', workspace: 'company' },
	{ to: '/billing/clients', label: 'billing', role: 'hr', match: '/billing' },
	{ to: '/admin', label: 'admin', role: 'admin' }
];

type Props = {
	role: Role;
	workspace: WorkspaceKind;
	onNavigate: () => void;
};

export function MainNav({ role, workspace, onNavigate }: Props) {
	const { t } = useTranslation('nav');
	const pathname = useRouterState({ select: (state) => state.location.pathname });
	return (
		<ul className={styles.list}>
			{entries
				.filter((entry) => hasRole(role, entry.role))
				.filter((entry) => entry.workspace === undefined || entry.workspace === workspace)
				.map((entry) => (
					<li key={entry.to}>
						<Link
							to={entry.to}
							activeOptions={{ exact: entry.to === '/' }}
							aria-current={entry.match && pathname.startsWith(entry.match) ? 'page' : undefined}
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
