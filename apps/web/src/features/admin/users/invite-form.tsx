import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { createUserSchema, locales, roles, type Employee } from '@zeit/shared';
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
import { createUser } from '../api';
import { employeeField, linkOptions, noEmployee } from './employee-link';

const fields = createUserSchema.shape;

const schema = z.object({
	email: fields.email,
	displayName: fields.displayName,
	role: fields.role,
	locale: z.enum(locales),
	employeeId: employeeField
});

type Props = {
	employees: Employee[];
	onDone: (email?: string) => void;
};

export function InviteForm({ employees, onDone }: Props) {
	const { t, i18n } = useTranslation(['admin', 'common']);
	const errorText = useErrorText();
	const queryClient = useQueryClient();
	const reauth = useReauth();
	const { control, handleSubmit } = useForm({
		resolver: zodResolver(schema),
		defaultValues: {
			email: '',
			displayName: '',
			role: 'employee' as const,
			locale: 'de' as const,
			employeeId: noEmployee
		}
	});

	const invite = useMutation({
		mutationFn: createUser,
		onSuccess: async (user) => {
			await queryClient.invalidateQueries({ queryKey: ['users'] });
			await queryClient.invalidateQueries({ queryKey: ['employees'] });
			onDone(user.email);
		}
	});

	return (
		<>
			<form
				className={styles.panel}
				noValidate
				aria-labelledby="invite"
				onSubmit={handleSubmit((input) =>
					invite.mutate(input, { onError: reauth.onError(() => invite.mutate(input)) })
				)}
			>
				<div>
					<h2 id="invite">{t('users.invite')}</h2>
					<p className={styles.lead}>{t('users.inviteHint')}</p>
				</div>
				<div className={styles.fields}>
					<FormField
						control={control}
						name="email"
						label={t('users.email')}
						type="email"
						autoComplete="off"
						autoFocus
					/>
					<FormField control={control} name="displayName" label={t('users.name')} />
					<FormSelect
						control={control}
						name="role"
						label={t('users.role')}
						options={roles.map((role) => ({ id: role, label: t(`common:roles.${role}`) }))}
					/>
					<FormSelect
						control={control}
						name="locale"
						label={t('users.locale')}
						options={locales.map((locale) => ({ id: locale, label: t(`users.locales.${locale}`) }))}
					/>
					<FormSelect
						control={control}
						name="employeeId"
						label={t('users.employee')}
						description={t('users.employeeHint')}
						options={linkOptions(employees, i18n.language, t('users.noEmployee'))}
					/>
				</div>
				{invite.error && <Notice tone="error">{errorText(invite.error)}</Notice>}
				<div className={styles.actions}>
					<Button type="submit" variant="primary" isPending={invite.isPending}>
						{t('users.sendInvite')}
					</Button>
					<Button variant="quiet" onPress={() => onDone()}>
						{t('cancel')}
					</Button>
				</div>
			</form>
			{reauth.dialog}
		</>
	);
}
