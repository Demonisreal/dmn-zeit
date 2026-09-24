import { useId, type ReactNode } from 'react';
import field from '../../../components/ui/field.module.css';
import styles from './select-field.module.css';

type Props = {
	label: string;
	value: string;
	onChange: (value: string) => void;
	children: ReactNode;
};

// native on purpose: filters get the phone's own picker and need no popover
export function SelectField({ label, value, onChange, children }: Props) {
	const id = useId();
	return (
		<div className={field.field}>
			<label htmlFor={id} className={field.label}>
				{label}
			</label>
			<span className={styles.wrap}>
				<select
					id={id}
					value={value}
					onChange={(e) => onChange(e.target.value)}
					className={`${field.input} ${styles.select}`}
				>
					{children}
				</select>
			</span>
		</div>
	);
}
