import { useQuery } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '../../../components/ui/button';
import { EmptyState } from '../../../components/ui/empty-state';
import { Field } from '../../../components/ui/field';
import { Table } from '../../../components/ui/table';
import { formatDate } from '../../../i18n/format';
import { employeesQuery, teamsQuery, workModelsQuery } from '../api';
import { HrNav } from '../hr-nav';
import { Checkbox } from '../ui/checkbox';
import { Loading, LoadError } from '../ui/states';
import styles from '../ui/page.module.css';
import { byLastName, fullName } from './employee-options';
import { EmployeeForm } from './employee-form';

export function PeoplePage() {
	const { t, i18n } = useTranslation('hr');
	const [search, setSearch] = useState('');
	const [includeExited, setIncludeExited] = useState(false);
	const [creating, setCreating] = useState(false);
	const employees = useQuery(employeesQuery(includeExited));
	const teams = useQuery(teamsQuery);
	const workModels = useQuery({ ...workModelsQuery(), enabled: creating });
	const date = (iso: string) => formatDate(iso, i18n.language);
	const teamName = new Map(teams.data?.map((team) => [team.id, team.name]));

	const needle = search.trim().toLocaleLowerCase(i18n.language);
	const shown = (employees.data ?? [])
		.filter(
			(employee) =>
				needle === '' ||
				fullName(employee).toLocaleLowerCase(i18n.language).includes(needle) ||
				employee.personnelNo.toLocaleLowerCase(i18n.language).includes(needle)
		)
		.toSorted(byLastName(i18n.language));

	let list;
	if (employees.isError) {
		list = <LoadError error={employees.error} onRetry={() => void employees.refetch()} />;
	} else if (!employees.data) {
		list = <Loading rows={8} />;
	} else if (employees.data.length === 0) {
		list = <EmptyState title={t('people.empty')}>{t('people.emptyHint')}</EmptyState>;
	} else if (shown.length === 0) {
		list = <EmptyState title={t('people.noMatch', { search: search.trim() })} />;
	} else {
		list = (
			<div className={styles.scroll}>
				<Table label={t('people.title')}>
					<thead>
						<tr>
							<th scope="col">{t('people.personnelNo')}</th>
							<th scope="col">{t('people.name')}</th>
							<th scope="col">{t('people.team')}</th>
							<th scope="col" data-numeric>
								{t('people.entry')}
							</th>
							<th scope="col" data-numeric>
								{t('people.exit')}
							</th>
						</tr>
					</thead>
					<tbody>
						{shown.map((employee) => (
							<tr key={employee.id}>
								<td className={styles.mono}>{employee.personnelNo}</td>
								<td>
									<Link to="/hr/people/$id" params={{ id: employee.id }}>
										{fullName(employee)}
									</Link>
								</td>
								<td>
									{employee.teamId ? (
										teamName.get(employee.teamId)
									) : (
										<span className={styles.muted}>{t('people.noTeam')}</span>
									)}
								</td>
								<td data-numeric>{date(employee.entryDate)}</td>
								<td data-numeric>{employee.exitDate ? date(employee.exitDate) : ''}</td>
							</tr>
						))}
					</tbody>
				</Table>
			</div>
		);
	}

	let form = null;
	if (creating && workModels.isError) {
		form = <LoadError error={workModels.error} onRetry={() => void workModels.refetch()} />;
	} else if (creating && workModels.data && teams.data) {
		form = (
			<EmployeeForm
				teams={teams.data}
				workModels={workModels.data}
				onDone={() => setCreating(false)}
			/>
		);
	} else if (creating) {
		form = <Loading rows={3} />;
	}

	return (
		<>
			<HrNav />
			<div className={styles.page}>
				<header className={styles.head}>
					<div>
						<h1>{t('people.title')}</h1>
						<p className={styles.lead}>{t('people.lead')}</p>
					</div>
					{!creating && (
						<Button variant="primary" onPress={() => setCreating(true)}>
							{t('people.new')}
						</Button>
					)}
				</header>

				{form}

				<section className={styles.section} aria-label={t('people.title')}>
					<div className={styles.filters}>
						<Field label={t('people.search')} type="search" value={search} onChange={setSearch} />
						<Checkbox isSelected={includeExited} onChange={setIncludeExited}>
							{t('people.includeExited')}
						</Checkbox>
					</div>
					{list}
				</section>
			</div>
		</>
	);
}
