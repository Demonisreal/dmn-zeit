import {
	Button,
	FieldError,
	Label,
	ListBox,
	ListBoxItem,
	Popover,
	Select,
	SelectValue,
	Text,
	type SelectProps
} from 'react-aria-components';
import { useController, type Control, type FieldPath, type FieldValues } from 'react-hook-form';
import { issueText } from '../../i18n';
import field from './field.module.css';
import css from './select-field.module.css';

const styles = css as Record<'trigger' | 'value' | 'caret' | 'popover' | 'list' | 'option', string>;
const fieldStyles = field as Record<'field' | 'label' | 'description' | 'error', string>;

export type Option = { id: string; label: string };

type Props = Omit<
	SelectProps<Option>,
	'children' | 'className' | 'style' | 'isInvalid' | 'validationBehavior' | 'items'
> & {
	label: string;
	options: Option[];
	description?: string | undefined;
	error?: string | undefined;
};

export function SelectField({ label, options, description, error, ...props }: Props) {
	return (
		<Select
			{...props}
			isInvalid={error !== undefined}
			validationBehavior="aria"
			className={fieldStyles.field}
		>
			<Label className={fieldStyles.label}>{label}</Label>
			<Button className={styles.trigger}>
				<SelectValue className={styles.value} />
				<span className={styles.caret} aria-hidden="true" />
			</Button>
			{description && (
				<Text slot="description" className={fieldStyles.description}>
					{description}
				</Text>
			)}
			<FieldError className={fieldStyles.error}>{error}</FieldError>
			<Popover className={styles.popover} offset={4}>
				<ListBox items={options} className={styles.list}>
					{(option) => (
						<ListBoxItem className={styles.option} textValue={option.label}>
							{option.label}
						</ListBoxItem>
					)}
				</ListBox>
			</Popover>
		</Select>
	);
}

type FormSelectProps<T extends FieldValues, TOut> = Omit<
	Props,
	'value' | 'onChange' | 'onBlur' | 'error'
> & {
	control: Control<T, unknown, TOut>;
	name: FieldPath<T>;
};

export function FormSelect<T extends FieldValues, TOut>({
	control,
	name,
	...props
}: FormSelectProps<T, TOut>) {
	const { field, fieldState } = useController({ control, name });
	const message = fieldState.error?.message;
	return (
		<SelectField
			{...props}
			value={(field.value as string | null) || null}
			onChange={(key) => field.onChange(key === null ? '' : String(key))}
			onBlur={field.onBlur}
			error={message === undefined ? undefined : issueText(message)}
		/>
	);
}
