import { browserSupportsWebAuthn } from '@simplewebauthn/browser';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { Passkey } from '@zeit/shared';
import { useRef, useState } from 'react';
import { VisuallyHidden } from 'react-aria-components';
import { useTranslation } from 'react-i18next';
import { Button } from '../../components/ui/button';
import { ConfirmDialog } from '../../components/ui/confirm-dialog';
import { Table } from '../../components/ui/table';
import { formatInstant } from '../../i18n/format';
import { removePasskey, securityQuery } from '../../lib/api/auth';
import { hasCode } from '../../lib/api/errors';
import { AddPasskey } from './add-passkey';
import { ErrorNotice } from './error-notice';
import { ReauthDialog } from './reauth-dialog';
import { RenamePasskey } from './rename-passkey';
import styles from './security.module.css';

type Props = {
	passkeys: Passkey[];
	onCodes: (recoveryCodes: string[]) => void;
};

export function PasskeyList({ passkeys, onCodes }: Props) {
	const { t, i18n } = useTranslation('security');
	const queryClient = useQueryClient();
	const [adding, setAdding] = useState(false);
	const [closed, setClosed] = useState(false);
	const [renaming, setRenaming] = useState<string | null>(null);
	const [renamed, setRenamed] = useState<string | null>(null);
	const [removing, setRemoving] = useState<Passkey | null>(null);
	const heading = useRef<HTMLHeadingElement>(null);
	const refresh = () => queryClient.invalidateQueries({ queryKey: securityQuery.queryKey });

	const remove = useMutation({
		mutationFn: removePasskey,
		onSuccess: async () => {
			setRemoving(null);
			await refresh();
			heading.current?.focus();
		}
	});
	const stepUp = hasCode(remove.error, 'REAUTH_REQUIRED');
	const close = () => {
		setRemoving(null);
		remove.reset();
	};
	const closeForm = () => {
		setAdding(false);
		setClosed(true);
	};

	return (
		<section className={styles.section} aria-labelledby="passkeys">
			<div className={styles.sectionHead}>
				<h2 id="passkeys" ref={heading} tabIndex={-1} className={styles.anchor}>
					{t('passkey.title')}
				</h2>
				{!adding && browserSupportsWebAuthn() && (
					<Button autoFocus={closed} onPress={() => setAdding(true)}>
						{t('passkey.add')}
					</Button>
				)}
			</div>
			<p className={styles.text}>{t('passkey.intro')}</p>
			{adding && (
				<div className={styles.panel}>
					<AddPasskey
						onCancel={closeForm}
						onCreated={async ({ recoveryCodes }) => {
							closeForm();
							if (recoveryCodes.length > 0) onCodes(recoveryCodes);
							await refresh();
						}}
					/>
				</div>
			)}
			{passkeys.length === 0 ? (
				<p className={styles.text}>{t('passkey.empty')}</p>
			) : (
				<div className={styles.scroll} role="group" aria-label={t('passkey.list')} tabIndex={0}>
					<Table label={t('passkey.list')}>
						<thead>
							<tr>
								<th>{t('passkey.name')}</th>
								<th data-numeric>{t('passkey.created')}</th>
								<th data-numeric>{t('passkey.lastUsed')}</th>
								<th>
									<VisuallyHidden>{t('passkey.actions')}</VisuallyHidden>
								</th>
							</tr>
						</thead>
						<tbody>
							{passkeys.map((passkey) =>
								renaming === passkey.id ? (
									<tr key={passkey.id}>
										<td colSpan={4}>
											<RenamePasskey
												passkey={passkey}
												onDone={() => {
													setRenaming(null);
													setRenamed(passkey.id);
												}}
												onSaved={refresh}
											/>
										</td>
									</tr>
								) : (
									<tr key={passkey.id}>
										<td>
											{passkey.name}
											<span className={styles.meta}>
												{t(passkey.backedUp ? 'passkey.synced' : 'passkey.deviceBound')}
											</span>
										</td>
										<td data-numeric>
											{formatInstant(passkey.createdAt, i18n.language, { dateStyle: 'medium' })}
										</td>
										<td data-numeric>
											{passkey.lastUsedAt
												? formatInstant(passkey.lastUsedAt, i18n.language)
												: t('passkey.never')}
										</td>
										<td>
											<div className={styles.rowActions}>
												<Button
													variant="quiet"
													aria-label={t('passkey.renameLabel', { name: passkey.name })}
													autoFocus={renamed === passkey.id}
													onPress={() => setRenaming(passkey.id)}
												>
													{t('passkey.rename')}
												</Button>
												<Button
													variant="quiet"
													aria-label={t('passkey.removeLabel', { name: passkey.name })}
													onPress={() => setRemoving(passkey)}
												>
													{t('passkey.remove')}
												</Button>
											</div>
										</td>
									</tr>
								)
							)}
						</tbody>
					</Table>
				</div>
			)}
			<ConfirmDialog
				isOpen={removing !== null && !stepUp}
				onClose={close}
				title={t('passkey.removeTitle', { name: removing?.name ?? '' })}
				confirmLabel={t('passkey.remove')}
				onConfirm={() => removing && remove.mutate(removing.id)}
				isPending={remove.isPending}
				error={
					remove.error && (
						<ErrorNotice error={remove.error} texts={{ INVALID_STATE: t('lastFactor') }} />
					)
				}
			>
				<p>{t('passkey.removeText')}</p>
			</ConfirmDialog>
			<ReauthDialog
				isOpen={stepUp}
				onClose={close}
				onConfirmed={() => removing && remove.mutate(removing.id)}
			/>
		</section>
	);
}
