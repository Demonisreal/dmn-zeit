import { Link, useRouterState, type LinkProps } from '@tanstack/react-router';
import { useEffect, useRef } from 'react';
import styles from './section-nav.module.css';

type Entry = {
	to: NonNullable<LinkProps['to']>;
	label: string;
	exact?: boolean;
	match?: string;
};

type Props = {
	label: string;
	entries: Entry[];
};

export function SectionNav({ label, entries }: Props) {
	const pathname = useRouterState({ select: (state) => state.location.pathname });
	const list = useRef<HTMLUListElement>(null);

	useEffect(() => {
		const row = list.current;
		const active = row?.querySelector<HTMLElement>('[aria-current="page"]');
		if (!row || !active) return;
		const offset = active.getBoundingClientRect().left - row.getBoundingClientRect().left;
		row.scrollLeft += offset - (row.clientWidth - active.offsetWidth) / 2;
	}, [pathname]);

	return (
		<nav className={styles.nav} aria-label={label}>
			<ul ref={list} className={styles.list}>
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
