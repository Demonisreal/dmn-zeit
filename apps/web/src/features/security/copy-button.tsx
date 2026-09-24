import { useEffect, useState } from 'react';
import { VisuallyHidden } from 'react-aria-components';
import { useTranslation } from 'react-i18next';
import { Button } from '../../components/ui/button';

type Props = {
	text: string;
	label: string;
};

export function CopyButton({ text, label }: Props) {
	const { t } = useTranslation('security');
	const [copied, setCopied] = useState(false);

	useEffect(() => {
		if (!copied) return;
		const timer = setTimeout(() => setCopied(false), 2000);
		return () => clearTimeout(timer);
	}, [copied]);

	return (
		<>
			<Button onPress={() => void navigator.clipboard.writeText(text).then(() => setCopied(true))}>
				{copied ? t('copied') : label}
			</Button>
			{/* a changed button label is not announced reliably, the status region is */}
			<VisuallyHidden>
				<span role="status">{copied ? t('copied') : ''}</span>
			</VisuallyHidden>
		</>
	);
}
