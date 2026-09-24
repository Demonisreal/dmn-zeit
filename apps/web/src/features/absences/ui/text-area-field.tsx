import { useId, type ComponentProps } from 'react';
import field from '../../../components/ui/field.module.css';
import styles from './text-area-field.module.css';

type Props = Omit<ComponentProps<'textarea'>, 'id' | 'className'> & {
	label: string;
	description?: string | undefined;
	error?: string | undefined;
};

export function TextAreaField({ label, description, error, rows = 3, ...props }: Props) {
	const id = useId();
	const hints = [description && `${id}-hint`, error && `${id}-error`].filter(Boolean).join(' ');
	return (
		<div className={field.field}>
			<label htmlFor={id} className={field.label}>
				{label}
			</label>
			<textarea
				{...props}
				id={id}
				rows={rows}
				aria-invalid={error ? true : undefined}
				aria-describedby={hints || undefined}
				className={`${field.input} ${styles.area}`}
			/>
			{description && (
				<p id={`${id}-hint`} className={field.description}>
					{description}
				</p>
			)}
			{error && (
				<p id={`${id}-error`} className={field.error}>
					{error}
				</p>
			)}
		</div>
	);
}
