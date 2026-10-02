import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import type { Client } from '@zeit/shared';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '../../components/ui/button';
import { ConfirmDialog } from '../../components/ui/confirm-dialog';
import { Notice } from '../../components/ui/notice';
import { hasCode } from '../../lib/api/errors';
import { useErrorText } from '../hr/error-text';
import styles from '../hr/ui/page.module.css';
import { useReauth } from '../security/reauth-dialog';
import { archiveClient, removeClient } from './api';

const draftOpen = (err: unknown) =>
	hasCode(err, 'INVALID_STATE') &&
	!Array.isArray(err.details) &&
	err.details?.message === 'client.openDraft';

type Props = {
	client: Client;
	canDelete: boolean;
};

export function ClientActions({ client, canDelete }: Props) {
	const { t } = useTranslation('billing');
	const errorText = useErrorText();
	const queryClient = useQueryClient();
	const navigate = useNavigate();
	const reauth = useReauth();
	const [asking, setAsking] = useState<'archive' | 'delete' | null>(null);

	const done = async () => {
		setAsking(null);
		await queryClient.invalidateQueries({ queryKey: ['clients'] });
	};
	const archive = useMutation({ mutationFn: () => archiveClient(client.id), onSuccess: done });
	const remove = useMutation({
		mutationFn: () => removeClient(client.id),
		onSuccess: async () => {
			await navigate({ to: '/billing/clients' });
			await done();
		}
	});
	const pending = asking === 'archive' ? archive : remove;

	const close = () => {
		setAsking(null);
		archive.reset();
		remove.reset();
	};

	if (client.restrictedAt) return null;

	return (
		<div className={styles.rowActions}>
			{!client.archivedAt && (
				<Button
					variant="quiet"
					aria-label={t('clients.archiveTitle', { name: client.name })}
					onPress={() => setAsking('archive')}
				>
					{t('clients.archive')}
				</Button>
			)}
			{canDelete && (
				<Button
					variant="quiet"
					aria-label={t('clients.deleteTitle', { name: client.name })}
					onPress={() => setAsking('delete')}
				>
					{t('clients.delete')}
				</Button>
			)}
			<ConfirmDialog
				isOpen={asking !== null}
				onClose={close}
				title={t(asking === 'delete' ? 'clients.deleteTitle' : 'clients.archiveTitle', {
					name: client.name
				})}
				confirmLabel={asking === 'delete' ? t('clients.delete') : t('clients.archive')}
				onConfirm={() =>
					asking === 'delete'
						? remove.mutate(undefined, { onError: reauth.onError(() => remove.mutate()) })
						: archive.mutate()
				}
				isPending={pending.isPending}
				error={
					pending.error && (
						<Notice tone="error">
							{draftOpen(pending.error) ? t('clients.openDraft') : errorText(pending.error)}
						</Notice>
					)
				}
			>
				<p>{asking === 'delete' ? t('clients.deleteText') : t('clients.archiveText')}</p>
			</ConfirmDialog>
			{reauth.dialog}
		</div>
	);
}
