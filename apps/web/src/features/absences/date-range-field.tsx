import { parseDate } from '@internationalized/date';
import {
	Button,
	CalendarCell,
	CalendarGrid,
	DateInput,
	DateRangePicker,
	DateSegment,
	Dialog,
	FieldError,
	Group,
	Heading,
	Label,
	Popover,
	RangeCalendar
} from 'react-aria-components';
import { Chevron } from '../../components/ui/chevron';
import field from '../../components/ui/field.module.css';
import css from './date-range-field.module.css';

const fieldStyles = field as Record<'field' | 'label' | 'error', string>;
const styles = css as Record<
	| 'group'
	| 'input'
	| 'segment'
	| 'dash'
	| 'toggle'
	| 'caret'
	| 'popover'
	| 'calendar'
	| 'calendarHead'
	| 'step'
	| 'heading'
	| 'grid'
	| 'cell',
	string
>;

type Props = {
	label: string;
	start: string;
	end: string;
	onChange: (start: string, end: string) => void;
	error?: string | undefined;
};

export function DateRangeField({ label, start, end, onChange, error }: Props) {
	return (
		<DateRangePicker
			value={start && end ? { start: parseDate(start), end: parseDate(end) } : null}
			onChange={(range) => onChange(range?.start.toString() ?? '', range?.end.toString() ?? '')}
			shouldForceLeadingZeros
			isInvalid={error !== undefined}
			validationBehavior="aria"
			className={fieldStyles.field}
		>
			<Label className={fieldStyles.label}>{label}</Label>
			<Group className={styles.group}>
				<DateInput slot="start" className={styles.input}>
					{(segment) => <DateSegment segment={segment} className={styles.segment} />}
				</DateInput>
				<span className={styles.dash} aria-hidden="true">
					–
				</span>
				<DateInput slot="end" className={styles.input}>
					{(segment) => <DateSegment segment={segment} className={styles.segment} />}
				</DateInput>
				<Button className={styles.toggle}>
					<span className={styles.caret} aria-hidden="true" />
				</Button>
			</Group>
			<FieldError className={fieldStyles.error}>{error}</FieldError>
			<Popover className={styles.popover} placement="bottom start" offset={4}>
				<Dialog aria-label={label}>
					<RangeCalendar className={styles.calendar}>
						<header className={styles.calendarHead}>
							<Button slot="previous" className={styles.step}>
								<Chevron direction="left" />
							</Button>
							<Heading className={styles.heading} />
							<Button slot="next" className={styles.step}>
								<Chevron direction="right" />
							</Button>
						</header>
						<CalendarGrid className={styles.grid} weekdayStyle="short">
							{(date) => <CalendarCell date={date} className={styles.cell} />}
						</CalendarGrid>
					</RangeCalendar>
				</Dialog>
			</Popover>
		</DateRangePicker>
	);
}
