import { useQuery } from '@tanstack/react-query';
import type { RuleSetInfo } from '@zeit/shared';
import { useTranslation } from 'react-i18next';
import { Loading, LoadError } from '../../../components/ui/states';
import { Table } from '../../../components/ui/table';
import { formatDate, formatMinutes } from '../../../i18n/format';
import { ruleVersionsQuery } from '../api';
import styles from '../ui/page.module.css';

const limits: (keyof RuleSetInfo['limits'])[] = [
	'regularDailyMinutes',
	'maxDailyMinutes',
	'breakOver6hMinutes',
	'breakOver9hMinutes',
	'minBreakMinutes',
	'maxContinuousMinutes',
	'minRestMinutes'
];

// arbzg-1994 -> 1994, @zeit/rules names each set after the year its limits took effect
export const versionYear = (version: string) => version.split('-')[1];

export function RuleVersions() {
	const { t, i18n } = useTranslation('hr');
	const versions = useQuery(ruleVersionsQuery);

	let body;
	if (versions.isError) {
		body = <LoadError error={versions.error} onRetry={() => void versions.refetch()} />;
	} else if (!versions.data) {
		body = <Loading rows={3} />;
	} else {
		body = (
			<div
				className={`${styles.scroll} ${styles.rules}`}
				role="group"
				aria-label={t('rules.title')}
				tabIndex={0}
			>
				<Table label={t('rules.title')}>
					<thead>
						<tr>
							<th scope="col">{t('rules.limit')}</th>
							{versions.data.map((version) => (
								<th key={version.version} scope="col" data-numeric>
									{t('rules.versionLabel', { year: versionYear(version.version) })}
									<br />
									{t('rules.validFrom', { date: formatDate(version.validFrom, i18n.language) })}
								</th>
							))}
						</tr>
					</thead>
					<tbody>
						{limits.map((limit) => (
							<tr key={limit}>
								<th scope="row">{t(`rules.limits.${limit}`)}</th>
								{versions.data.map((version) => (
									<td key={version.version} data-numeric>
										{formatMinutes(version.limits[limit])}
									</td>
								))}
							</tr>
						))}
					</tbody>
				</Table>
			</div>
		);
	}

	return (
		<section className={styles.section} aria-labelledby="rule-versions">
			<div>
				<h2 id="rule-versions">{t('rules.title')}</h2>
				<p className={styles.lead}>{t('rules.lead')}</p>
			</div>
			{body}
		</section>
	);
}
