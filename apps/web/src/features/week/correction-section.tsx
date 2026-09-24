import type { Day } from '@zeit/shared';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '../../components/ui/button';
import { Notice } from '../../components/ui/notice';
import { CorrectionForm } from './correction-form';
import styles from './form.module.css';

type Props = {
	day: Day;
	employeeId: string;
};

export function CorrectionSection({ day, employeeId }: Props) {
	const { t } = useTranslation('week');
	const [mode, setMode] = useState<'idle' | 'form' | 'sent'>('idle');
	// focus goes back to the button once the form closes, not on first render
	const [closed, setClosed] = useState(false);

	if (mode === 'form') {
		return (
			<CorrectionForm
				day={day}
				employeeId={employeeId}
				onSent={() => {
					setMode('sent');
					setClosed(true);
				}}
				onCancel={() => {
					setMode('idle');
					setClosed(true);
				}}
			/>
		);
	}

	return (
		<div className={styles.section}>
			{mode === 'sent' && <Notice tone="success">{t('correction.sent')}</Notice>}
			<div>
				<Button variant="secondary" autoFocus={closed} onPress={() => setMode('form')}>
					{t('correction.open')}
				</Button>
			</div>
		</div>
	);
}
