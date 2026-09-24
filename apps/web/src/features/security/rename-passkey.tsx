import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation } from '@tanstack/react-query';
import { renamePasskeySchema, type Passkey } from '@zeit/shared';
import { useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { Button } from '../../components/ui/button';
import { FormField } from '../../components/ui/field';
import { renamePasskey } from '../../lib/api/auth';
import { ErrorNotice } from './error-notice';
import styles from './security.module.css';

type Props = {
	passkey: Passkey;
	onDone: () => void;
	onSaved: () => Promise<void>;
};

export function RenamePasskey({ passkey, onDone, onSaved }: Props) {
	const { t } = useTranslation('security');
	const { control, handleSubmit } = useForm({
		resolver: zodResolver(renamePasskeySchema),
		defaultValues: { name: passkey.name }
	});
	const rename = useMutation({
		mutationFn: (name: string) => renamePasskey(passkey.id, { name }),
		onSuccess: async () => {
			await onSaved();
			onDone();
		}
	});

	return (
		<form
			noValidate
			className={styles.rename}
			onSubmit={handleSubmit(({ name }) => rename.mutate(name))}
		>
			<FormField
				control={control}
				name="name"
				label={t('passkey.name')}
				autoComplete="off"
				autoFocus
				onKeyDown={(e) => e.key === 'Escape' && onDone()}
			/>
			<Button type="submit" variant="primary" isPending={rename.isPending}>
				{t('save')}
			</Button>
			<Button variant="quiet" isDisabled={rename.isPending} onPress={onDone}>
				{t('cancel')}
			</Button>
			{rename.error && <ErrorNotice error={rename.error} />}
		</form>
	);
}
