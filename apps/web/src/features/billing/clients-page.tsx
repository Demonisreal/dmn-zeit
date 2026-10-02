import { useQuery } from '@tanstack/react-query';
import { Link, useNavigate } from '@tanstack/react-router';
import { hasRole, type Role } from '@zeit/shared';
import { useState } from 'react';
import { VisuallyHidden } from 'react-aria-components';
import { useTranslation } from 'react-i18next';
import { Button } from '../../components/ui/button';
import { Checkbox } from '../../components/ui/checkbox';
import { EmptyState } from '../../components/ui/empty-state';
import { Field } from '../../components/ui/field';
import { Page, PageHead } from '../../components/ui/page-shell';
import { Loading, LoadError } from '../../components/ui/states';
import { Table } from '../../components/ui/table';
import { Tag } from '../../components/ui/tag';
import styles from '../hr/ui/page.module.css';
import { clientsQuery, projectsQuery } from './api';
import { BillingNav } from './billing-nav';
import { ClientActions } from './client-actions';
import { ClientForm } from './client-form';
import css from './clients-page.module.css';
import { RatesTable } from './rates-table';

type Props = {
	role: Role;
	solo: boolean;
};

export function ClientsPage({ role, solo }: Props) {
	const { t, i18n } = useTranslation('billing');
	const navigate = useNavigate();
	const [search, setSearch] = useState('');
	const [includeArchived, setIncludeArchived] = useState(false);
	const [creating, setCreating] = useState(false);
	const [closed, setClosed] = useState(false);
	const clients = useQuery(clientsQuery);
	const projects = useQuery(projectsQuery());
	const lng = i18n.language;

	const projectCount = new Map<string, number>();
	for (const project of projects.data ?? []) {
		if (project.archivedAt) continue;
		projectCount.set(project.clientId, (projectCount.get(project.clientId) ?? 0) + 1);
	}

	const needle = search.trim().toLocaleLowerCase(lng);
	const active = (clients.data ?? []).filter((client) => includeArchived || !client.archivedAt);
	const shown = active
		.filter(
			(client) =>
				needle === '' ||
				client.name.toLocaleLowerCase(lng).includes(needle) ||
				client.number?.toLocaleLowerCase(lng).includes(needle)
		)
		.toSorted((a, b) => a.name.localeCompare(b.name, lng));

	const open = () => setCreating(true);

	let list;
	if (clients.isError) {
		list = <LoadError error={clients.error} onRetry={() => void clients.refetch()} />;
	} else if (!clients.data) {
		list = <Loading rows={6} />;
	} else if (clients.data.length === 0) {
		list = (
			<EmptyState
				title={t('clients.firstRun.title')}
				action={
					!creating && (
						<Button variant="primary" onPress={open}>
							{t('clients.firstRun.action')}
						</Button>
					)
				}
			>
				{t('clients.firstRun.text')}
			</EmptyState>
		);
	} else if (active.length === 0) {
		list = <EmptyState title={t('clients.allArchived')} />;
	} else if (shown.length === 0) {
		list = <EmptyState title={t('clients.noMatch', { search: search.trim() })} />;
	} else {
		list = (
			<div className={styles.scroll} tabIndex={0}>
				<Table label={t('clients.title')}>
					<thead>
						<tr>
							<th scope="col">{t('client.name')}</th>
							<th scope="col" data-priority="mid">
								{t('client.number')}
							</th>
							<th scope="col" data-priority="wide">
								{t('client.city')}
							</th>
							<th scope="col" data-priority="wide">
								{t('client.kind')}
							</th>
							<th scope="col" data-numeric>
								{t('projects.title')}
							</th>
							<th scope="col">
								<VisuallyHidden>{t('actions')}</VisuallyHidden>
							</th>
						</tr>
					</thead>
					<tbody>
						{shown.map((client) => (
							<tr key={client.id}>
								<td className={css.name}>
									<Link to="/billing/clients/$id" params={{ id: client.id }}>
										{client.name}
									</Link>{' '}
									{client.restrictedAt ? (
										<Tag>{t('restricted')}</Tag>
									) : (
										client.archivedAt && <Tag>{t('archived')}</Tag>
									)}
								</td>
								<td className={styles.mono} data-priority="mid">
									{client.number}
								</td>
								<td data-priority="wide">{client.city}</td>
								<td className={css.kind} data-priority="wide">
									{client.isBusiness ? t('client.business') : t('client.private')}
								</td>
								<td data-numeric>{projects.data ? (projectCount.get(client.id) ?? 0) : ''}</td>
								<td>
									<ClientActions client={client} canDelete={hasRole(role, 'admin')} />
								</td>
							</tr>
						))}
					</tbody>
				</Table>
			</div>
		);
	}

	return (
		<>
			<BillingNav role={role} />
			<Page>
				<PageHead>
					<div>
						<h1>{t('clients.title')}</h1>
						<p className={styles.lead}>{t('clients.lead')}</p>
					</div>
					{!creating && clients.data?.length !== 0 && (
						<Button variant="primary" autoFocus={closed} onPress={open}>
							{t('clients.new')}
						</Button>
					)}
				</PageHead>

				{creating && (
					<ClientForm
						onDone={(created) => {
							setCreating(false);
							setClosed(true);
							if (created)
								void navigate({ to: '/billing/clients/$id', params: { id: created.id } });
						}}
					/>
				)}

				<section className={styles.section} aria-label={t('clients.title')}>
					{clients.data && clients.data.length > 0 && (
						<div className={styles.filters}>
							<Field
								label={t('clients.search')}
								type="search"
								value={search}
								onChange={setSearch}
							/>
							<Checkbox isSelected={includeArchived} onChange={setIncludeArchived}>
								{t('clients.includeArchived')}
							</Checkbox>
						</div>
					)}
					{list}
				</section>

				<RatesTable scope={{ kind: 'default' }} solo={solo} />
			</Page>
		</>
	);
}
