import { Link, useRouterState, type LinkProps } from '@tanstack/react-router';
import styles from './section-nav.module.css';

type Entry = {
	to: NonNullable<LinkProps['to']>;
	label: string;
	exact?: boolean;
	// detail pages that live outside the entry's own path but belong to it
	match?: string;
};

type Props = {
	label: string;
	entries: Entry[];
};

export function SectionNav({ label, entries }: Props) {
	const pathname = useRouterState({ select: (state) => state.location.pathname });
	return (
		<nav className={styles.nav} aria-label={label}>
			<ul className={styles.list}>
				{entries.map((entry) => (
					<li key={entry.to}>
						<Link
							to={entry.to}
							activeOptions={{ exact: entry.exact ?? false, includeSearch: false }}
							aria-current={entry.match && pathname.startsWith(entry.match) ? 'page' : undefined}
							className={styles.link}
						>
							{entry.label}
						</Link>
					</li>
				))}
			</ul>
		</nav>
	);
}
