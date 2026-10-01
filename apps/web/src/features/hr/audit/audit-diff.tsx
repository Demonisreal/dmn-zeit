import type { AuditEntry } from '@zeit/shared';
import { Fragment } from 'react';
import { useTranslation } from 'react-i18next';
import styles from '../ui/page.module.css';
import css from './audit-diff.module.css';

const shown = (value: unknown) => {
	if (value === null || value === undefined) return '–';
	if (typeof value === 'object') return JSON.stringify(value);
	return String(value);
};

export function AuditDiff({ changes }: { changes: NonNullable<AuditEntry['changes']> }) {
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
				{Object.entries(changes).map(([field, [before, after]]) => (
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

export function AuditContext({ context }: { context: NonNullable<AuditEntry['context']> }) {
	return (
		<dl className={css.context}>
			{Object.entries(context).map(([field, value]) => (
				<Fragment key={field}>
					<dt>{field}</dt>
					<dd>{shown(value)}</dd>
				</Fragment>
			))}
		</dl>
	);
}
