import { useQuery } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import { Fragment, useRef, useState } from 'react';
import { VisuallyHidden } from 'react-aria-components';
import { useTranslation } from 'react-i18next';
import { Button } from '../../../components/ui/button';
import { EmptyState } from '../../../components/ui/empty-state';
import { SelectField } from '../../../components/ui/select-field';
import { Loading, LoadError } from '../../../components/ui/states';
import { Table } from '../../../components/ui/table';
import { Tag } from '../../../components/ui/tag';
import { formatDate, formatInstant } from '../../../i18n/format';
import { employeesQuery, findingsQuery } from '../api';
import { HrNav } from '../hr-nav';
import { employeeOptions } from '../people/employee-options';
import { DateInputField } from '../ui/date-field';
import styles from '../ui/page.module.css';
import { AckForm } from './ack-form';
import { factParams, findingKey, paragraphOf } from './finding-text';
import { RuleVersions, versionYear } from './rule-versions';

export const stateFilters = ['open', 'acknowledged', 'all'] as const;

export type FindingsFilter = {
	state: (typeof stateFilters)[number];
	from: string;
	to: string;
	employee?: string | undefined;
};

type Props = {
	filter: FindingsFilter;
	onFilter: (next: Partial<FindingsFilter>) => void;
};

const everyone = 'all';
const DAY_MS = 86_400_000;

export function FindingsPage({ filter, onFilter }: Props) {
	const { t, i18n } = useTranslation('hr');
	const [acking, setAcking] = useState<string | null>(null);
	const heading = useRef<HTMLHeadingElement>(null);
	const employees = useQuery(employeesQuery(true));
	const date = (iso: string) => formatDate(iso, i18n.language);

	// the api allows a year at most; asking anyway would only come back as a validation error
	let rangeProblem: string | undefined;
	if (filter.from > filter.to) rangeProblem = t('rangeUnordered');
	else if ((Date.parse(filter.to) - Date.parse(filter.from)) / DAY_MS >= 366) {
		rangeProblem = t('rangeTooLong');
	}

	const findings = useQuery({
		...findingsQuery({
			from: filter.from,
			to: filter.to,
			employee: filter.employee,
			state: filter.state === 'all' ? undefined : filter.state
		}),
		enabled: rangeProblem === undefined
	});

	let body;
	if (rangeProblem) {
		body = null;
	} else if (findings.isError) {
		body = <LoadError error={findings.error} onRetry={() => void findings.refetch()} />;
	} else if (!findings.data) {
		body = <Loading rows={6} />;
	} else if (findings.data.length === 0) {
		body = <EmptyState title={t('findings.empty')}>{t('findings.emptyHint')}</EmptyState>;
	} else {
		body = (
			<div className={styles.scroll} role="region" aria-label={t('findings.title')} tabIndex={0}>
				<Table label={t('findings.title')}>
					<thead>
						<tr>
							<th scope="col">{t('findings.date')}</th>
							<th scope="col">{t('findings.employee')}</th>
							<th scope="col">{t('findings.rule')}</th>
							<th scope="col" className={styles.colWide}>
								{t('findings.ruleVersion')}
							</th>
							<th scope="col">{t('findings.status')}</th>
						</tr>
					</thead>
					<tbody>
						{findings.data.map((finding) => {
							const key = findingKey(finding);
							const open = finding.severity === 'warning' && !finding.ack;
							return (
								<Fragment key={key}>
									<tr>
										<td className={styles.mono}>{date(finding.date)}</td>
										<td>
											<Link
												to="/time"
												search={{
													employee: finding.employee.id,
													month: finding.date.slice(0, 7),
													day: finding.date
												}}
											>
												{finding.employee.name}
											</Link>
										</td>
										<td>
											<span title={t(`findings.ruleName.${finding.code}`)}>
												<Tag tone={open ? 'error' : 'neutral'}>{paragraphOf(finding.code)}</Tag>
											</span>
											<VisuallyHidden>
												, {t(`findings.states.${finding.ack ? 'acknowledged' : 'open'}`)}
											</VisuallyHidden>{' '}
											<span className={styles.colMid}>
												{t(`findings.text.${finding.code}`, factParams(finding.facts))}
											</span>
										</td>
										<td className={styles.colWide}>
											{t('rules.versionLabel', { year: versionYear(finding.ruleVersion) })}
										</td>
										<td>
											{finding.ack ? (
												<span className={styles.small}>
													{t('findings.acked', {
														at: formatInstant(finding.ack.at, i18n.language),
														by: finding.ack.by.displayName
													})}
													<br />
													<span className={styles.muted}>{finding.ack.note}</span>
												</span>
											) : (
												acking !== key && (
													<Button
														variant="secondary"
														aria-label={t('findings.ackTitle', { name: finding.employee.name })}
														onPress={() => setAcking(key)}
													>
														{t('findings.ack')}
													</Button>
												)
											)}
										</td>
									</tr>
									{acking === key && (
										<tr>
											<td colSpan={5}>
												<AckForm
													finding={finding}
													onDone={() => {
														setAcking(null);
														// once acknowledged the row loses its button or leaves the list
														heading.current?.focus();
													}}
												/>
											</td>
										</tr>
									)}
								</Fragment>
							);
						})}
					</tbody>
				</Table>
			</div>
		);
	}

	return (
		<>
			<HrNav />
			<div className={styles.page}>
				<header className={styles.head}>
					<div>
						<h1 ref={heading} tabIndex={-1} className={styles.anchor}>
							{t('findings.title')}
						</h1>
						<p className={styles.lead}>{t('findings.lead')}</p>
					</div>
				</header>
				<section className={styles.section} aria-label={t('findings.title')}>
					<div className={styles.filters}>
						<SelectField
							label={t('findings.status')}
							options={stateFilters.map((id) => ({ id, label: t(`findings.states.${id}`) }))}
							value={filter.state}
							onChange={(key) => onFilter({ state: key as FindingsFilter['state'] })}
						/>
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
							label={t('findings.employee')}
							options={[
								{ id: everyone, label: t('findings.everyone') },
								...employeeOptions(employees.data ?? [], i18n.language)
							]}
							value={filter.employee ?? everyone}
							onChange={(key) =>
								onFilter({ employee: key === everyone || key === null ? undefined : String(key) })
							}
						/>
					</div>
					{body}
				</section>
				<RuleVersions />
			</div>
		</>
	);
}
