import { useQuery } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '../../../components/ui/button';
import { Loading, LoadError } from '../../../components/ui/states';
import { formatDate } from '../../../i18n/format';
import { contractsQuery, employeeQuery, teamsQuery, workModelsQuery } from '../api';
import { currentMonth, todayIso } from '../dates';
import { HrNav } from '../hr-nav';
import styles from '../ui/page.module.css';
import { ContractForm } from './contract-form';
import { ContractHistory } from './contract-history';
import { contractOn } from './contract-schema';
import { fullName } from './employee-options';
import { ExitForm } from './exit-form';
import { MasterDataForm } from './master-data-form';

type Props = {
	id: string;
};

export function EmployeePage({ id }: Props) {
	const { t, i18n } = useTranslation('hr');
	const [editing, setEditing] = useState(false);
	const [adding, setAdding] = useState(false);
	// only the button of the form that just closed mounts again and takes the focus back
	const [closed, setClosed] = useState(false);
	const employee = useQuery(employeeQuery(id));
	const contracts = useQuery(contractsQuery(id));
	const workModels = useQuery(workModelsQuery(true));
	const teams = useQuery(teamsQuery);
	const date = (iso: string) => formatDate(iso, i18n.language);

	const failed = [employee, contracts, workModels, teams].find((query) => query.isError);

	let body;
	if (failed) {
		body = <LoadError error={failed.error} onRetry={() => void failed.refetch()} />;
	} else if (!employee.data || !contracts.data || !workModels.data || !teams.data) {
		body = <Loading rows={6} />;
	} else {
		const person = employee.data;
		const team = teams.data.find((candidate) => candidate.id === person.teamId);
		body = (
			<>
				<header className={styles.head}>
					<div>
						<h1>{fullName(person)}</h1>
						<p className={styles.lead}>
							{t('people.detailLead', { no: person.personnelNo, entry: date(person.entryDate) })}
						</p>
					</div>
					{!editing && (
						<Button variant="secondary" autoFocus={closed} onPress={() => setEditing(true)}>
							{t('people.edit')}
						</Button>
					)}
				</header>

				{editing ? (
					<MasterDataForm
						employee={person}
						teams={teams.data}
						onDone={() => {
							setEditing(false);
							setClosed(true);
						}}
					/>
				) : (
					<dl className={styles.facts}>
						<dt>{t('people.personnelNo')}</dt>
						<dd className={styles.mono}>{person.personnelNo}</dd>
						<dt>{t('people.team')}</dt>
						<dd>{team?.name ?? t('people.noTeam')}</dd>
						<dt>{t('people.entry')}</dt>
						<dd className={styles.mono}>{date(person.entryDate)}</dd>
						<dt>{t('people.exit')}</dt>
						<dd className={styles.mono}>{person.exitDate ? date(person.exitDate) : '–'}</dd>
						<dt>{t('people.account')}</dt>
						<dd>{person.userId ? t('people.hasAccount') : t('people.noAccount')}</dd>
						<dt>{t('people.closedThrough')}</dt>
						<dd className={styles.mono}>
							{person.closedThrough ? date(person.closedThrough) : '–'}
						</dd>
					</dl>
				)}

				<p className={`${styles.actions} ${styles.small}`}>
					<Link to="/time" search={{ employee: person.id, month: currentMonth() }}>
						{t('people.toMonth')}
					</Link>
					<Link to="/hr/flex" search={{ employee: person.id }}>
						{t('people.toFlex')}
					</Link>
					<Link to="/print/timesheet/$id/$month" params={{ id: person.id, month: currentMonth() }}>
						{t('people.toTimesheet')}
					</Link>
					<Link to="/hr/audit" search={{ employee: person.id }}>
						{t('people.toAudit')}
					</Link>
				</p>

				<section className={styles.section} aria-labelledby="contracts">
					<div className={styles.sectionHead}>
						<h2 id="contracts">{t('contracts.title')}</h2>
						{!adding && (
							<Button variant="secondary" autoFocus={closed} onPress={() => setAdding(true)}>
								{t('contracts.new')}
							</Button>
						)}
					</div>
					{adding && (
						<ContractForm
							employee={person}
							current={contractOn(contracts.data, todayIso())}
							workModels={workModels.data}
							onDone={() => {
								setAdding(false);
								setClosed(true);
							}}
						/>
					)}
					<ContractHistory
						employee={person}
						contracts={contracts.data}
						workModels={workModels.data}
					/>
				</section>

				<section className={styles.section} aria-labelledby="exit">
					<h2 id="exit">{t('people.exitTitle')}</h2>
					{person.exitDate ? (
						<p>{t('people.exitSet', { date: date(person.exitDate) })}</p>
					) : (
						<ExitForm employee={person} />
					)}
				</section>
			</>
		);
	}

	return (
		<>
			<HrNav />
			<div className={styles.page}>
				<p className={styles.small}>
					<Link to="/hr">{t('people.back')}</Link>
				</p>
				{body}
			</div>
		</>
	);
}
