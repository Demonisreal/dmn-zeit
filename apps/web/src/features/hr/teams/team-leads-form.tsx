import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { Employee, Team } from '@zeit/shared';
import { useState } from 'react';
import { CheckboxGroup, Label, Text } from 'react-aria-components';
import { useTranslation } from 'react-i18next';
import { Button } from '../../../components/ui/button';
import { Notice } from '../../../components/ui/notice';
import { setTeamLeads } from '../api';
import { useErrorText } from '../error-text';
import { fullName } from '../people/employee-options';
import { Checkbox } from '../ui/checkbox';
import styles from '../ui/page.module.css';
import css from './team-leads-form.module.css';

const own = css as Record<'group' | 'label' | 'options', string>;

type Props = {
	team: Team;
	employees: Employee[];
	onDone: () => void;
};

export function TeamLeadsForm({ team, employees, onDone }: Props) {
	const { t, i18n } = useTranslation('hr');
	const errorText = useErrorText();
	const queryClient = useQueryClient();
	const [chosen, setChosen] = useState(team.leads.map((lead) => lead.id));

	// leads are accounts, not personnel records; a lead without a record stays choosable
	const candidates = new Map<string, string>();
	for (const employee of employees) {
		if (employee.userId) candidates.set(employee.userId, fullName(employee));
	}
	for (const lead of team.leads) {
		if (!candidates.has(lead.id)) candidates.set(lead.id, lead.displayName);
	}
	const options = [...candidates].toSorted(([, a], [, b]) => a.localeCompare(b, i18n.language));

	const save = useMutation({
		mutationFn: () => setTeamLeads(team.id, chosen),
		onSuccess: async () => {
			await queryClient.invalidateQueries({ queryKey: ['teams'] });
			onDone();
		}
	});

	return (
		<div className={styles.panel}>
			<CheckboxGroup value={chosen} onChange={setChosen} className={own.group}>
				<Label className={own.label}>{t('teams.leadsFor', { name: team.name })}</Label>
				<Text slot="description" className={`${styles.small} ${styles.muted}`}>
					{t('teams.leadsHint')}
				</Text>
				<div className={own.options}>
					{options.map(([userId, name]) => (
						<Checkbox key={userId} value={userId}>
							{name}
						</Checkbox>
					))}
				</div>
			</CheckboxGroup>
			{save.error && <Notice tone="error">{errorText(save.error)}</Notice>}
			<div className={styles.actions}>
				<Button variant="primary" isPending={save.isPending} onPress={() => save.mutate()}>
					{t('teams.saveLeads')}
				</Button>
				<Button variant="quiet" onPress={onDone}>
					{t('cancel')}
				</Button>
			</div>
		</div>
	);
}
