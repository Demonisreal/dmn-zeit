import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { createTeamSchema, type CreateTeamInput, type Team } from '@zeit/shared';
import { useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { Button } from '../../../components/ui/button';
import { FormField } from '../../../components/ui/field';
import { Notice } from '../../../components/ui/notice';
import { createTeam, updateTeam } from '../api';
import { useErrorText } from '../error-text';
import styles from '../ui/page.module.css';

type Props = {
	team?: Team | undefined;
	onDone: () => void;
};

export function TeamNameForm({ team, onDone }: Props) {
	const { t } = useTranslation('hr');
	const errorText = useErrorText();
	const queryClient = useQueryClient();
	const { control, handleSubmit } = useForm({
		resolver: zodResolver(createTeamSchema),
		defaultValues: { name: team?.name ?? '' }
	});

	const save = useMutation({
		mutationFn: (input: CreateTeamInput) => (team ? updateTeam(team.id, input) : createTeam(input)),
		onSuccess: async () => {
			await queryClient.invalidateQueries({ queryKey: ['teams'] });
			onDone();
		}
	});

	return (
		<form
			className={styles.panel}
			noValidate
			aria-label={team ? t('teams.renameTitle', { name: team.name }) : t('teams.new')}
			onSubmit={handleSubmit((input) => save.mutate(input))}
		>
			<div className={styles.filters}>
				<FormField
					control={control}
					name="name"
					label={team ? t('teams.newName') : t('teams.name')}
					autoFocus
				/>
				<div className={styles.actions}>
					<Button type="submit" variant="primary" isPending={save.isPending}>
						{team ? t('save') : t('teams.create')}
					</Button>
					<Button variant="quiet" onPress={onDone}>
						{t('cancel')}
					</Button>
				</div>
			</div>
			{save.error && <Notice tone="error">{errorText(save.error)}</Notice>}
		</form>
	);
}
