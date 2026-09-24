import { FieldError, Label, Text, TextArea, TextField } from 'react-aria-components';
import { useController, type Control, type FieldPath, type FieldValues } from 'react-hook-form';
import field from '../../components/ui/field.module.css';
import { issueText } from '../../i18n';
import css from './form.module.css';

const fieldStyles = field as Record<'field' | 'label' | 'input' | 'description' | 'error', string>;
const styles = css as Record<'area', string>;

type Props<T extends FieldValues, TOut> = {
	control: Control<T, unknown, TOut>;
	name: FieldPath<T>;
	label: string;
	description?: string;
	rows?: number;
};

export function FormTextArea<T extends FieldValues, TOut>({
	control,
	name,
	label,
	description,
	rows = 3
}: Props<T, TOut>) {
	const { field: input, fieldState } = useController({ control, name });
	const message = fieldState.error?.message;
	return (
		<TextField
			name={input.name}
			value={input.value as string}
			onChange={input.onChange}
			onBlur={input.onBlur}
			isInvalid={message !== undefined}
			validationBehavior="aria"
			className={fieldStyles.field}
		>
			<Label className={fieldStyles.label}>{label}</Label>
			<TextArea ref={input.ref} rows={rows} className={`${fieldStyles.input} ${styles.area}`} />
			{description && (
				<Text slot="description" className={fieldStyles.description}>
					{description}
				</Text>
			)}
			<FieldError className={fieldStyles.error}>
				{message === undefined ? undefined : issueText(message)}
			</FieldError>
		</TextField>
	);
}
