import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { noticeChannels, type NoticeChannel, type VacationNotice } from '@zeit/shared';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '../../../components/ui/button';
import { EmptyState } from '../../../components/ui/empty-state';
import { Notice } from '../../../components/ui/notice';
import { Table } from '../../../components/ui/table';
import { Tag } from '../../../components/ui/tag';
import { formatDate, formatDays } from '../../../i18n/format';
import { employeesQuery, noticesQuery, sendNotices } from '../api';
import { currentYear, formatInstant } from '../dates';
import { useErrorText } from '../error-text';
import { HrNav } from '../hr-nav';
import { byLastName, fullName } from '../people/employee-options';
import { Checkbox } from '../ui/checkbox';
import { SelectField } from '../ui/select-field';
import { Loading, LoadError } from '../ui/states';
import styles from '../ui/page.module.css';

export function NoticesPage() {
	const { t, i18n } = useTranslation('hr');
	const errorText = useErrorText();
	const queryClient = useQueryClient();
	const [year, setYear] = useState(currentYear());
	const [channel, setChannel] = useState<NoticeChannel>('in_app');
	const [chosen, setChosen] = useState<string[]>([]);
	const employees = useQuery(employeesQuery());
	const notices = useQuery(noticesQuery(year));
	const date = (iso: string) => formatDate(iso, i18n.language);

	const send = useMutation({
		mutationFn: (employeeIds: string[]) => sendNotices({ bucketYear: year, employeeIds, channel }),
		onSuccess: async () => {
			setChosen([]);
			await queryClient.invalidateQueries({ queryKey: ['vacation-notices', year] });
		}
	});

	const latest = new Map<string, VacationNotice>();
	for (const notice of notices.data ?? []) {
		const seen = latest.get(notice.employee.id);
		if (!seen || seen.sentAt < notice.sentAt) latest.set(notice.employee.id, notice);
	}

	const years = [currentYear() - 1, currentYear()].map((option) => ({
		id: String(option),
		label: String(option)
	}));
	const channels = noticeChannels.map((id) => ({ id, label: t(`notices.channel.${id}`) }));

	const failed = [employees, notices].find((query) => query.isError);
	let body;
	if (failed) {
		body = <LoadError error={failed.error} onRetry={() => void failed.refetch()} />;
	} else if (!employees.data || !notices.data) {
		body = <Loading rows={8} />;
	} else if (employees.data.length === 0) {
		body = <EmptyState title={t('people.empty')} />;
	} else {
		const people = employees.data.toSorted(byLastName(i18n.language));
		const all = chosen.length === people.length;
		body = (
			<>
				<div className={styles.scroll}>
					<Table label={t('notices.tableLabel', { year })}>
						<thead>
							<tr>
								<th scope="col">
									<Checkbox
										aria-label={t('notices.chooseAll')}
										isSelected={all}
										isIndeterminate={chosen.length > 0 && !all}
										onChange={(on) => setChosen(on ? people.map((person) => person.id) : [])}
									/>
								</th>
								<th scope="col">{t('people.name')}</th>
								<th scope="col" data-numeric>
									{t('notices.remaining')}
								</th>
								<th scope="col" data-numeric>
									{t('notices.deadline')}
								</th>
								<th scope="col" data-numeric>
									{t('notices.sentAt')}
								</th>
								<th scope="col">{t('notices.channelLabel')}</th>
								<th scope="col">{t('notices.acknowledged')}</th>
							</tr>
						</thead>
						<tbody>
							{people.map((person) => {
								const notice = latest.get(person.id);
								return (
									<tr key={person.id}>
										<td>
											<Checkbox
												aria-label={fullName(person)}
												isSelected={chosen.includes(person.id)}
												onChange={(on) =>
													setChosen(
														on ? [...chosen, person.id] : chosen.filter((id) => id !== person.id)
													)
												}
											/>
										</td>
										<td>{fullName(person)}</td>
										{notice ? (
											<>
												<td data-numeric>{formatDays(notice.remainingDays, i18n.language)}</td>
												<td data-numeric>{date(notice.deadline)}</td>
												<td data-numeric>{formatInstant(notice.sentAt, i18n.language)}</td>
												<td>{t(`notices.channel.${notice.channel}`)}</td>
												<td>
													{notice.acknowledgedAt ? (
														<span className={styles.mono}>
															{formatInstant(notice.acknowledgedAt, i18n.language)}
														</span>
													) : (
														<Tag tone="warning">{t('notices.open')}</Tag>
													)}
												</td>
											</>
										) : (
											<td colSpan={5} className={styles.muted}>
												{t('notices.none')}
											</td>
										)}
									</tr>
								);
							})}
						</tbody>
					</Table>
				</div>
				<div className={styles.filters}>
					<SelectField
						label={t('notices.channelLabel')}
						options={channels}
						value={channel}
						onChange={(key) => key !== null && setChannel(key as NoticeChannel)}
					/>
					<Button
						variant="primary"
						isDisabled={chosen.length === 0}
						isPending={send.isPending}
						onPress={() => send.mutate(chosen)}
					>
						{t('notices.send', { count: chosen.length })}
					</Button>
				</div>
				{send.isSuccess && (
					<Notice tone="success">{t('notices.sent', { count: send.variables.length })}</Notice>
				)}
				{send.error && <Notice tone="error">{errorText(send.error)}</Notice>}
			</>
		);
	}

	return (
		<>
			<HrNav />
			<div className={styles.page}>
				<header className={styles.head}>
					<div>
						<h1>{t('notices.title')}</h1>
						<p className={styles.lead}>{t('notices.lead')}</p>
					</div>
				</header>
				<section className={styles.section} aria-label={t('notices.title')}>
					<div className={styles.filters}>
						<SelectField
							label={t('notices.year')}
							description={t('notices.yearHint')}
							options={years}
							value={String(year)}
							onChange={(key) => {
								setYear(Number(key));
								setChosen([]);
								send.reset();
							}}
						/>
					</div>
					{body}
				</section>
			</div>
		</>
	);
}
