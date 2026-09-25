import type { Ref } from 'react';
import {
	FieldError,
	Input,
	Label,
	Text,
	TextArea,
	TextField,
	type TextFieldProps
} from 'react-aria-components';
import { useController, type Control, type FieldPath, type FieldValues } from 'react-hook-form';
import { issueText } from '../../i18n';
import css from './field.module.css';

// react-aria refuses className={undefined}, naming the classes keeps them typed as plain strings
const styles = css as Record<
	'field' | 'label' | 'input' | 'area' | 'description' | 'error',
	string
>;

type Props = Omit<
	TextFieldProps,
	'children' | 'className' | 'style' | 'isInvalid' | 'validationBehavior'
> & {
	label: string;
	description?: string | undefined;
	error?: string | undefined;
	inputRef?: Ref<HTMLInputElement>;
};

export function Field({ label, description, error, inputRef, ...props }: Props) {
	return (
		<TextField
			{...props}
			isInvalid={error !== undefined}
			validationBehavior="aria"
			className={styles.field}
		>
			<Label className={styles.label}>{label}</Label>
			<Input ref={inputRef} className={styles.input} />
			{description && (
				<Text slot="description" className={styles.description}>
					{description}
				</Text>
			)}
			<FieldError className={styles.error}>{error}</FieldError>
		</TextField>
	);
}

type FormFieldProps<T extends FieldValues, TOut> = Omit<
	Props,
	'name' | 'value' | 'onChange' | 'onBlur' | 'error' | 'inputRef'
> & {
	control: Control<T, unknown, TOut>;
	name: FieldPath<T>;
};

export function FormField<T extends FieldValues, TOut>({
	control,
	name,
	...props
}: FormFieldProps<T, TOut>) {
	const { field, fieldState } = useController({ control, name });
	const message = fieldState.error?.message;
	return (
		<Field
			{...props}
			name={field.name}
			value={field.value as string}
			onChange={field.onChange}
			onBlur={field.onBlur}
			inputRef={field.ref}
			error={message === undefined ? undefined : issueText(message)}
		/>
	);
}

type TextAreaProps = Omit<Props, 'inputRef'> & {
	rows?: number;
	areaRef?: Ref<HTMLTextAreaElement>;
};

export function TextAreaField({
	label,
	description,
	error,
	rows = 3,
	areaRef,
	...props
}: TextAreaProps) {
	return (
		<TextField
			{...props}
			isInvalid={error !== undefined}
			validationBehavior="aria"
			className={styles.field}
		>
			<Label className={styles.label}>{label}</Label>
			<TextArea ref={areaRef} rows={rows} className={`${styles.input} ${styles.area}`} />
			{description && (
				<Text slot="description" className={styles.description}>
					{description}
				</Text>
			)}
			<FieldError className={styles.error}>{error}</FieldError>
		</TextField>
	);
}

type FormTextAreaProps<T extends FieldValues, TOut> = Omit<
	TextAreaProps,
	'name' | 'value' | 'onChange' | 'onBlur' | 'error' | 'areaRef'
> & {
	control: Control<T, unknown, TOut>;
	name: FieldPath<T>;
};

export function FormTextArea<T extends FieldValues, TOut>({
	control,
	name,
	...props
}: FormTextAreaProps<T, TOut>) {
	const { field, fieldState } = useController({ control, name });
	const message = fieldState.error?.message;
	return (
		<TextAreaField
			{...props}
			name={field.name}
			value={field.value as string}
			onChange={field.onChange}
			onBlur={field.onBlur}
			areaRef={field.ref}
			error={message === undefined ? undefined : issueText(message)}
		/>
	);
}
