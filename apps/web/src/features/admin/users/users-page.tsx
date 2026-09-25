import { useQuery } from '@tanstack/react-query';
import type { UserStatus } from '@zeit/shared';
import { Fragment, useState } from 'react';
import { VisuallyHidden } from 'react-aria-components';
import { useTranslation } from 'react-i18next';
import { Button } from '../../../components/ui/button';
import { EmptyState } from '../../../components/ui/empty-state';
import { Notice } from '../../../components/ui/notice';
import { Page, PageHead } from '../../../components/ui/page-shell';
import { Loading, LoadError } from '../../../components/ui/states';
import { Table } from '../../../components/ui/table';
import { Tag } from '../../../components/ui/tag';
import { formatInstant } from '../../../i18n/format';
import { employeesQuery } from '../../hr/api';
import { fullName } from '../../hr/people/employee-options';
import page from '../../hr/ui/page.module.css';
import { AdminNav } from '../admin-nav';
import { usersQuery } from '../api';
import { InviteForm } from './invite-form';
import { UserEditor } from './user-editor';
import styles from './users-page.module.css';

const statusTone: Record<UserStatus, 'neutral' | 'pending'> = {
	active: 'neutral',
	invited: 'pending',
	disabled: 'neutral',
	demo: 'neutral'
};

type Props = {
	selfId: string;
};

export function UsersPage({ selfId }: Props) {
	const { t, i18n } = useTranslation(['admin', 'common']);
	const [inviting, setInviting] = useState(false);
	const [closed, setClosed] = useState(false);
	const [invited, setInvited] = useState<string>();
	const [editing, setEditing] = useState<string | null>(null);
	// the row's edit button is rebuilt after editing and takes the focus back
	const [edited, setEdited] = useState<string | null>(null);
	const users = useQuery(usersQuery);
	const employees = useQuery(employeesQuery(true));
	const failed = [users, employees].find((query) => query.isError);

	let list;
	if (failed) {
		list = <LoadError error={failed.error} onRetry={() => void failed.refetch()} />;
	} else if (!users.data || !employees.data) {
		list = <Loading rows={8} />;
	} else if (users.data.length === 0) {
		list = <EmptyState title={t('users.empty')} />;
	} else {
		const people = employees.data;
		const names = new Map(people.map((employee) => [employee.id, fullName(employee)]));
		list = (
			<div className={page.scroll} role="region" aria-label={t('users.title')} tabIndex={0}>
				<Table label={t('users.title')}>
					<thead>
						<tr>
							<th scope="col">{t('users.name')}</th>
							<th scope="col" data-priority="mid">
								{t('users.role')}
							</th>
							<th scope="col">{t('users.status')}</th>
							<th scope="col" data-priority="wide">
								{t('users.employee')}
							</th>
							<th scope="col" data-numeric data-priority="wide">
								{t('users.lastLogin')}
							</th>
							<th scope="col">
								<VisuallyHidden>{t('actions')}</VisuallyHidden>
							</th>
						</tr>
					</thead>
					<tbody>
						{users.data
							.toSorted((a, b) => a.displayName.localeCompare(b.displayName, i18n.language))
							.map((user) => (
								<Fragment key={user.id}>
									<tr>
										<td>
											{user.displayName}
											<br />
											<span className={`${page.small} ${page.muted} ${styles.email}`}>
												{user.email}
											</span>
											<span className={`${page.small} ${page.muted} ${styles.role}`}>
												{t(`common:roles.${user.role}`)}
											</span>
										</td>
										<td data-priority="mid">{t(`common:roles.${user.role}`)}</td>
										<td>
											<Tag tone={statusTone[user.status]}>{t(`users.statuses.${user.status}`)}</Tag>
										</td>
										<td data-priority="wide">
											{user.employeeId ? (
												(names.get(user.employeeId) ?? '–')
											) : (
												<span className={page.muted}>{t('users.noEmployee')}</span>
											)}
										</td>
										<td data-numeric data-priority="wide">
											{user.lastLoginAt ? formatInstant(user.lastLoginAt, i18n.language) : '–'}
										</td>
										<td>
											<div className={page.rowActions}>
												{user.id === selfId ? (
													<span className={`${page.small} ${page.muted}`}>{t('users.self')}</span>
												) : (
													editing !== user.id && (
														<Button
															variant="quiet"
															aria-label={t('users.editTitle', { name: user.displayName })}
															autoFocus={edited === user.id}
															onPress={() => setEditing(user.id)}
														>
															{t('edit')}
														</Button>
													)
												)}
											</div>
										</td>
									</tr>
									{editing === user.id && (
										<tr>
											<td colSpan={6}>
												<UserEditor
													user={user}
													employees={people}
													onDone={() => {
														setEditing(null);
														setEdited(user.id);
													}}
												/>
											</td>
										</tr>
									)}
								</Fragment>
							))}
					</tbody>
				</Table>
			</div>
		);
	}

	return (
		<>
			<AdminNav />
			<Page>
				<PageHead>
					<div>
						<h1>{t('users.title')}</h1>
						<p className={page.lead}>{t('users.lead')}</p>
					</div>
					{!inviting && (
						<Button
							variant="primary"
							autoFocus={closed}
							onPress={() => {
								setInvited(undefined);
								setInviting(true);
							}}
						>
							{t('users.invite')}
						</Button>
					)}
				</PageHead>
				{inviting && employees.data && (
					<InviteForm
						employees={employees.data}
						onDone={(email) => {
							setInviting(false);
							setInvited(email);
							setClosed(true);
						}}
					/>
				)}
				{invited && <Notice tone="success">{t('users.invited', { email: invited })}</Notice>}
				<section className={page.section}>{list}</section>
			</Page>
		</>
	);
}
