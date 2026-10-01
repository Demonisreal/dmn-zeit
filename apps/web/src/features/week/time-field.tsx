import { parseTime } from '@internationalized/date';
import { DateInput, DateSegment, FieldError, Label, TimeField } from 'react-aria-components';
import { useController, type Control, type FieldPath, type FieldValues } from 'react-hook-form';
import field from '../../components/ui/field.module.css';
import { issueText } from '../../i18n';
import css from './form.module.css';

const fieldStyles = field as Record<'field' | 'label' | 'error', string>;
const styles = css as Record<'segments' | 'segment', string>;

type Props<T extends FieldValues, TOut> = {
	control: Control<T, unknown, TOut>;
	name: FieldPath<T>;
	label: string;
};

export function FormTime<T extends FieldValues, TOut>({ control, name, label }: Props<T, TOut>) {
	const { field: input, fieldState } = useController({ control, name });
	const message = fieldState.error?.message;
	const text = input.value as string;
	return (
		<TimeField
			value={text ? parseTime(text) : null}
			onChange={(time) => input.onChange(time ? time.toString().slice(0, 5) : '')}
			onBlur={input.onBlur}
			hourCycle={24}
			granularity="minute"
			shouldForceLeadingZeros
			isInvalid={message !== undefined}
			validationBehavior="aria"
			className={fieldStyles.field}
		>
			<Label className={fieldStyles.label}>{label}</Label>
			<DateInput className={styles.segments}>
				{(segment) => <DateSegment segment={segment} className={styles.segment} />}
			</DateInput>
			<FieldError className={fieldStyles.error}>
				{message === undefined ? undefined : issueText(message)}
			</FieldError>
		</TimeField>
	);
}
