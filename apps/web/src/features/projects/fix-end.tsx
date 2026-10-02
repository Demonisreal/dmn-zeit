import type { BookableProject, ProjectTimer } from '@zeit/shared';
import { useState } from 'react';
import { Dialog, Modal, ModalOverlay } from 'react-aria-components';
import { useTranslation } from 'react-i18next';
import dialog from '../../components/ui/dialog.module.css';
import { formatInstant } from '../../i18n/format';
import { stopTimer, useProjectMutation } from './api';
import { EntryForm } from './entry-form';
import { valuesOf, type EntryValues } from './entry-schema';
import css from './fix-end.module.css';

const dialogStyles = dialog as Record<'overlay' | 'modal' | 'dialog', string>;
const styles = css as Record<'text', string>;

export type RunningTimer = Extract<ProjectTimer, { state: 'running' }>;

type Fixing = { entryId: string; since: string; values: EntryValues };

export function useStop() {
	const stop = useProjectMutation(stopTimer);
	const [fixing, setFixing] = useState<Fixing | null>(null);
	const run = (running: RunningTimer) =>
		stop.mutate(undefined, {
			onSuccess: () => {
				if (!running.hint) return;
				setFixing({
					entryId: running.entryId,
					since: running.since,
					values: valuesOf({ ...running, startedAt: running.since, endedAt: null })
				});
			}
		});
	return { stop, run, fixing, close: () => setFixing(null) };
}

type Props = {
	fixing: Fixing | null;
	projects: BookableProject[];
	onClose: () => void;
};

export function FixEndDialog({ fixing, projects, onClose }: Props) {
	const { t, i18n } = useTranslation('projects');
	return (
		<ModalOverlay
			isOpen={fixing !== null}
			onOpenChange={(open) => !open && onClose()}
			isDismissable
			className={dialogStyles.overlay}
		>
			<Modal className={dialogStyles.modal} style={{ width: 'min(100%, 36rem)' }}>
				<Dialog aria-label={t('fix.title')} className={dialogStyles.dialog}>
					{fixing && (
						<>
							<p className={styles.text}>
								{t('fix.text', { since: formatInstant(fixing.since, i18n.language) })}
							</p>
							<EntryForm
								projects={projects}
								initial={fixing.values}
								entryId={fixing.entryId}
								title={t('fix.title')}
								onDone={onClose}
								onCancel={onClose}
							/>
						</>
					)}
				</Dialog>
			</Modal>
		</ModalOverlay>
	);
}
