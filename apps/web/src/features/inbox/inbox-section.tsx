import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '../../components/ui/button';
import page from '../absences/ui/page.module.css';
import { LoadError, Loading } from '../absences/ui/states';
import styles from './inbox.module.css';

type ListState = {
	isPending: boolean;
	error: Error | null;
	refetch: () => unknown;
	hasNextPage: boolean;
	isFetchingNextPage: boolean;
	fetchNextPage: () => unknown;
};

type Props<T> = {
	id: string;
	title: string;
	empty: string;
	list: ListState;
	items: T[];
	children: (item: T) => ReactNode;
};

export function InboxSection<T>({ id, title, empty, list, items, children }: Props<T>) {
	const { t } = useTranslation('inbox');

	const body = () => {
		if (list.isPending) return <Loading rows={2} />;
		if (list.error) return <LoadError error={list.error} onRetry={() => void list.refetch()} />;
		if (items.length === 0) return <p className={styles.empty}>{empty}</p>;
		return <ul className={styles.list}>{items.map(children)}</ul>;
	};

	return (
		<section aria-labelledby={`${id} ${id}-count`} className={page.section}>
			<div className={page.sectionHead}>
				<h2 id={id}>{title}</h2>
				{!list.isPending && !list.error && (
					<span id={`${id}-count`} className={page.count}>
						{items.length}
						{list.hasNextPage && '+'}
					</span>
				)}
			</div>
			{body()}
			{list.hasNextPage && (
				<div>
					<Button isPending={list.isFetchingNextPage} onPress={() => void list.fetchNextPage()}>
						{t('more')}
					</Button>
				</div>
			)}
		</section>
	);
}
