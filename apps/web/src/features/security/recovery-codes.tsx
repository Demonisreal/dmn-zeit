import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '../../components/ui/button';
import { Checkbox } from '../../components/ui/checkbox';
import { formatInstant } from '../../i18n/format';
import { CopyButton } from './copy-button';
import css from './security.module.css';

const styles = css as Record<'flow' | 'anchor' | 'codes' | 'actions', string>;

type Props = {
	codes: string[];
	doneLabel: string;
	onDone: () => void;
};

export function RecoveryCodes({ codes, doneLabel, onDone }: Props) {
	const { t, i18n } = useTranslation('security');
	const [saved, setSaved] = useState(false);
	const intro = useRef<HTMLParagraphElement>(null);

	useEffect(() => intro.current?.focus(), []);

	const download = () => {
		const date = formatInstant(new Date().toISOString(), i18n.language, { dateStyle: 'medium' });
		const text = [t('recovery.fileHead', { date }), '', ...codes, ''].join('\n');
		const url = URL.createObjectURL(new Blob([text], { type: 'text/plain;charset=utf-8' }));
		const link = document.createElement('a');
		link.href = url;
		link.download = t('recovery.fileName');
		link.click();
		setTimeout(() => URL.revokeObjectURL(url), 40_000);
	};

	return (
		<div className={styles.flow}>
			<p ref={intro} tabIndex={-1} className={styles.anchor}>
				{t('recovery.shownOnce')}
			</p>
			<ul className={styles.codes} aria-label={t('recovery.list')}>
				{codes.map((code) => (
					<li key={code}>
						<code>{code}</code>
					</li>
				))}
			</ul>
			<div className={styles.actions}>
				<CopyButton text={codes.join('\n')} label={t('copy')} />
				<Button onPress={download}>{t('recovery.download')}</Button>
			</div>
			<Checkbox isSelected={saved} onChange={setSaved}>
				{t('recovery.saved')}
			</Checkbox>
			<div className={styles.actions}>
				<Button variant="primary" isDisabled={!saved} onPress={onDone}>
					{doneLabel}
				</Button>
			</div>
		</div>
	);
}
