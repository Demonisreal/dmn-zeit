import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
	roles,
	updateUserSchema,
	type Employee,
	type UpdateUserInput,
	type User
} from '@zeit/shared';
import { useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { z } from 'zod';
import { Button } from '../../../components/ui/button';
import { FormField } from '../../../components/ui/field';
import { Notice } from '../../../components/ui/notice';
import { FormSelect } from '../../../components/ui/select-field';
import { useErrorText } from '../../hr/error-text';
import styles from '../../hr/ui/page.module.css';
import { useReauth } from '../../security/reauth-dialog';
import { updateUser } from '../api';
import { AccountActions } from './account-actions';
import { employeeField, linkOptions, noEmployee } from './employee-link';

const fields = updateUserSchema.required().shape;

const schema = z.object({
	displayName: fields.displayName,
	role: fields.role,
	employeeId: employeeField
});

type Props = {
	user: User;
	employees: Employee[];
	onDone: () => void;
};

export function UserEditor({ user, employees, onDone }: Props) {
	const { t, i18n } = useTranslation(['admin', 'common']);
	const errorText = useErrorText();
	const queryClient = useQueryClient();
	const reauth = useReauth();
	const { control, handleSubmit } = useForm({
		resolver: zodResolver(schema),
		defaultValues: {
			displayName: user.displayName,
			role: user.role,
			employeeId: user.employeeId ?? noEmployee
		}
	});

	const save = useMutation({
		mutationFn: (changes: UpdateUserInput) => updateUser(user.id, changes),
		onSuccess: async () => {
			await queryClient.invalidateQueries({ queryKey: ['users'] });
			await queryClient.invalidateQueries({ queryKey: ['employees'] });
			onDone();
		}
	});

	const submit = handleSubmit((input) => {
		const changes: UpdateUserInput = {};
		if (input.displayName !== user.displayName) changes.displayName = input.displayName;
		if (input.role !== user.role) changes.role = input.role;
		if (input.employeeId !== user.employeeId) changes.employeeId = input.employeeId;
		if (Object.keys(changes).length === 0) return onDone();
		save.mutate(changes, { onError: reauth.onError(() => save.mutate(changes)) });
	});

	return (
		<div className={styles.panel}>
			<form
				className={styles.section}
				noValidate
				aria-label={t('users.editTitle', { name: user.displayName })}
				onSubmit={submit}
			>
				<div className={styles.fields}>
					<FormField control={control} name="displayName" label={t('users.name')} autoFocus />
					<FormSelect
						control={control}
						name="role"
						label={t('users.role')}
						options={roles.map((role) => ({ id: role, label: t(`common:roles.${role}`) }))}
					/>
					<FormSelect
						control={control}
						name="employeeId"
						label={t('users.employee')}
						options={linkOptions(employees, i18n.language, t('users.noEmployee'), user.employeeId)}
					/>
				</div>
				{save.error && <Notice tone="error">{errorText(save.error)}</Notice>}
				<div className={styles.actions}>
					<Button type="submit" variant="primary" isPending={save.isPending}>
						{t('save')}
					</Button>
					<Button variant="quiet" onPress={onDone}>
						{t('cancel')}
					</Button>
				</div>
			</form>
			<AccountActions user={user} />
			{reauth.dialog}
		</div>
	);
}
