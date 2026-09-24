import { FieldError, Label, Text, TextArea, TextField } from 'react-aria-components';
import { useController, type Control, type FieldPath, type FieldValues } from 'react-hook-form';
import field from '../../../components/ui/field.module.css';
import { issueText } from '../../../i18n';
import css from './text-area-field.module.css';

const styles = field as Record<'field' | 'label' | 'input' | 'description' | 'error', string>;

type Props<T extends FieldValues, TOut> = {
	control: Control<T, unknown, TOut>;
	name: FieldPath<T>;
	label: string;
	description?: string | undefined;
	rows?: number;
};

export function FormTextArea<T extends FieldValues, TOut>({
	control,
	name,
	label,
	description,
	rows = 3
}: Props<T, TOut>) {
	const { field, fieldState } = useController({ control, name });
	const message = fieldState.error?.message;
	return (
		<TextField
			name={field.name}
			value={field.value as string}
			onChange={field.onChange}
			onBlur={field.onBlur}
			isInvalid={message !== undefined}
			validationBehavior="aria"
			className={styles.field}
		>
			<Label className={styles.label}>{label}</Label>
			<TextArea ref={field.ref} rows={rows} className={`${styles.input} ${css.area}`} />
			{description && (
				<Text slot="description" className={styles.description}>
					{description}
				</Text>
			)}
			<FieldError className={styles.error}>
				{message === undefined ? undefined : issueText(message)}
			</FieldError>
		</TextField>
	);
}
