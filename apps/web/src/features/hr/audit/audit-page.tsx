import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import type { AuditEntry } from '@zeit/shared';
import { Fragment, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '../../../components/ui/button';
import { EmptyState } from '../../../components/ui/empty-state';
import { SelectField } from '../../../components/ui/select-field';
import { Loading, LoadError } from '../../../components/ui/states';
import { Table } from '../../../components/ui/table';
import { Tag } from '../../../components/ui/tag';
import { formatInstant } from '../../../i18n/format';
import { auditQuery, employeesQuery, type AuditFilter } from '../api';
import { HrNav } from '../hr-nav';
import { employeeOptions, fullName } from '../people/employee-options';
import { DateInputField } from '../ui/date-field';
import styles from '../ui/page.module.css';
import { AuditContext, AuditDiff } from './audit-diff';

export const auditTables = [
	'time_entries',
	'correction_requests',
	'absence_requests',
	'absence_days',
	'vacation_ledger',
	'vacation_notices',
	'flex_bookings',
	'finding_acks',
	'contracts',
	'employees',
	'work_models',
	'teams',
	'team_leads',
	'month_closings',
	'users',
	'tenants'
] as const;

type AuditTable = (typeof auditTables)[number];

const isKnownTable = (table: string | null): table is AuditTable =>
	(auditTables as readonly (string | null)[]).includes(table);

const triggerActions = ['insert', 'update', 'delete'] as const;
const isTriggerAction = (action: string): action is (typeof triggerActions)[number] =>
	(triggerActions as readonly string[]).includes(action);

const all = 'all';
const DAY_MS = 86_400_000;

type Props = {
	filter: AuditFilter;
	onFilter: (next: Partial<AuditFilter>) => void;
};

export function AuditPage({ filter, onFilter }: Props) {
	const { t, i18n } = useTranslation(['hr', 'common']);
	const [open, setOpen] = useState<string[]>([]);
	const employees = useQuery(employeesQuery(true));
	const names = new Map(employees.data?.map((employee) => [employee.id, fullName(employee)]));

	let rangeProblem: string | undefined;
	if (filter.from > filter.to) rangeProblem = t('rangeUnordered');
	else if ((Date.parse(filter.to) - Date.parse(filter.from)) / DAY_MS >= 366) {
		rangeProblem = t('rangeTooLong');
	}

	const audit = useInfiniteQuery({ ...auditQuery(filter), enabled: rangeProblem === undefined });
	const entries = audit.data?.pages.flatMap((page) => page.items) ?? [];

	const toggle = (id: string) =>
		setOpen(open.includes(id) ? open.filter((other) => other !== id) : [...open, id]);

	const actionText = (entry: AuditEntry) =>
		isTriggerAction(entry.action) ? t(`audit.actions.${entry.action}`) : entry.action;

	let body;
	if (rangeProblem) {
		body = null;
	} else if (audit.isError) {
		body = <LoadError error={audit.error} onRetry={() => void audit.refetch()} />;
	} else if (!audit.data) {
		body = <Loading rows={8} />;
	} else if (entries.length === 0) {
		body = <EmptyState title={t('audit.empty')}>{t('audit.emptyHint')}</EmptyState>;
	} else {
		body = (
			<>
				<div className={styles.scroll}>
					<Table label={t('audit.title')}>
						<thead>
							<tr>
								<th scope="col">{t('audit.at')}</th>
								<th scope="col">{t('audit.actor')}</th>
								<th scope="col">{t('audit.action')}</th>
								<th scope="col">{t('audit.table')}</th>
								<th scope="col">{t('audit.employee')}</th>
								<th scope="col">{t('audit.changes')}</th>
							</tr>
						</thead>
						<tbody>
							{entries.map((entry) => {
								const fields = entry.changes ?? entry.context;
								return (
									<Fragment key={entry.id}>
										<tr>
											<td className={styles.mono}>
												{formatInstant(entry.occurredAt, i18n.language)}
											</td>
											<td>
												{entry.actorName ?? t('audit.system')}
												{entry.actorRole && (
													<span className={`${styles.small} ${styles.muted}`}>
														{' '}
														{t(`common:roles.${entry.actorRole}`)}
													</span>
												)}
											</td>
											<td>
												<Tag>{actionText(entry)}</Tag>
											</td>
											<td>
												{isKnownTable(entry.table)
													? t(`audit.tables.${entry.table}`)
													: (entry.table ?? '–')}
											</td>
											<td>
												{entry.subjectEmployeeId
													? (names.get(entry.subjectEmployeeId) ?? '–')
													: '–'}
											</td>
											<td>
												{fields ? (
													<Button
														variant="quiet"
														aria-expanded={open.includes(entry.id)}
														onPress={() => toggle(entry.id)}
													>
														{t('audit.showChanges', { count: Object.keys(fields).length })}
													</Button>
												) : (
													entry.ip && (
														<span className={`${styles.small} ${styles.mono}`}>{entry.ip}</span>
													)
												)}
											</td>
										</tr>
										{fields && open.includes(entry.id) && (
											<tr>
												<td colSpan={6}>
													{entry.changes ? (
														<AuditDiff changes={entry.changes} />
													) : (
														<AuditContext context={fields} />
													)}
												</td>
											</tr>
										)}
									</Fragment>
								);
							})}
						</tbody>
					</Table>
				</div>
				<div className={styles.actions}>
					<span className={`${styles.small} ${styles.muted}`}>
						{t('audit.loaded', { count: entries.length })}
					</span>
					{audit.hasNextPage && (
						<Button
							variant="secondary"
							isPending={audit.isFetchingNextPage}
							onPress={() => void audit.fetchNextPage()}
						>
							{t('audit.more')}
						</Button>
					)}
				</div>
			</>
		);
	}

	return (
		<>
			<HrNav />
			<div className={styles.page}>
				<header className={styles.head}>
					<div>
						<h1>{t('audit.title')}</h1>
						<p className={styles.lead}>{t('audit.lead')}</p>
					</div>
				</header>
				<section className={styles.section} aria-label={t('audit.title')}>
					<div className={styles.filters}>
						<DateInputField
							label={t('from')}
							value={filter.from}
							onChange={(from) => from && onFilter({ from })}
						/>
						<DateInputField
							label={t('to')}
							value={filter.to}
							onChange={(to) => to && onFilter({ to })}
							error={rangeProblem}
						/>
						<SelectField
							label={t('audit.table')}
							options={[
								{ id: all, label: t('audit.allTables') },
								...auditTables.map((table) => ({ id: table, label: t(`audit.tables.${table}`) }))
							]}
							value={filter.table ?? all}
							onChange={(key) => onFilter({ table: key === all ? undefined : String(key) })}
						/>
						<SelectField
							label={t('audit.employee')}
							options={[
								{ id: all, label: t('audit.everyone') },
								...employeeOptions(employees.data ?? [], i18n.language)
							]}
							value={filter.employee ?? all}
							onChange={(key) => onFilter({ employee: key === all ? undefined : String(key) })}
						/>
					</div>
					{body}
				</section>
			</div>
		</>
	);
}
