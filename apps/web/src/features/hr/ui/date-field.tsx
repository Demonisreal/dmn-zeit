import { parseDate } from '@internationalized/date';
import {
	DateField,
	DateInput,
	DateSegment,
	FieldError,
	Label,
	Text,
	type DateFieldProps,
	type DateValue
} from 'react-aria-components';
import { useController, type Control, type FieldPath, type FieldValues } from 'react-hook-form';
import field from '../../../components/ui/field.module.css';
import { issueText } from '../../../i18n';
import css from './date-field.module.css';

const styles = css as Record<'input' | 'segment', string>;
const fieldStyles = field as Record<'field' | 'label' | 'description' | 'error', string>;

type Props = Omit<
	DateFieldProps<DateValue>,
	| 'value'
	| 'onChange'
	| 'className'
	| 'style'
	| 'isInvalid'
	| 'validationBehavior'
	| 'granularity'
	| 'children'
> & {
	label: string;
	// iso date, empty while nothing is entered
	value: string;
	onChange: (value: string) => void;
	description?: string | undefined;
	error?: string | undefined;
};

export function DateInputField({ label, value, onChange, description, error, ...props }: Props) {
	return (
		<DateField
			{...props}
			value={value ? parseDate(value) : null}
			onChange={(date) => onChange(date ? date.toString() : '')}
			granularity="day"
			shouldForceLeadingZeros
			isInvalid={error !== undefined}
			validationBehavior="aria"
			className={fieldStyles.field}
		>
			<Label className={fieldStyles.label}>{label}</Label>
			<DateInput className={styles.input}>
				{(segment) => <DateSegment segment={segment} className={styles.segment} />}
			</DateInput>
			{description && (
				<Text slot="description" className={fieldStyles.description}>
					{description}
				</Text>
			)}
			<FieldError className={fieldStyles.error}>{error}</FieldError>
		</DateField>
	);
}

type FormDateProps<T extends FieldValues, TOut> = Omit<
	Props,
	'value' | 'onChange' | 'onBlur' | 'error'
> & {
	control: Control<T, unknown, TOut>;
	name: FieldPath<T>;
};

export function FormDate<T extends FieldValues, TOut>({
	control,
	name,
	...props
}: FormDateProps<T, TOut>) {
	const { field, fieldState } = useController({ control, name });
	const message = fieldState.error?.message;
	return (
		<DateInputField
			{...props}
			value={field.value as string}
			onChange={field.onChange}
			onBlur={field.onBlur}
			error={message === undefined ? undefined : issueText(message)}
		/>
	);
}
