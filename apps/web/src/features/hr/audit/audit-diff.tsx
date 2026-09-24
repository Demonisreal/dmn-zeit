import type { AuditEntry } from '@zeit/shared';
import { useTranslation } from 'react-i18next';
import styles from '../ui/page.module.css';
import css from './audit-diff.module.css';

type Props = {
	diff: NonNullable<AuditEntry['diff']>;
};

// values arrive as json from the trigger; they are only ever shown as text
const shown = (value: unknown) => {
	if (value === null || value === undefined) return '–';
	if (typeof value === 'object') return JSON.stringify(value);
	return String(value);
};

export function AuditDiff({ diff }: Props) {
	const { t } = useTranslation('hr');
	return (
		<table className={css.diff}>
			<thead>
				<tr>
					<th scope="col">{t('audit.field')}</th>
					<th scope="col">{t('audit.before')}</th>
					<th scope="col">{t('audit.after')}</th>
				</tr>
			</thead>
			<tbody>
				{Object.entries(diff).map(([field, [before, after]]) => (
					<tr key={field}>
						<th scope="row" className={styles.mono}>
							{field}
						</th>
						<td className={css.before}>{shown(before)}</td>
						<td className={css.after}>{shown(after)}</td>
					</tr>
				))}
			</tbody>
		</table>
	);
}
