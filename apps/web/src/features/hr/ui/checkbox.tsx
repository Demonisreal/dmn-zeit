import { Checkbox as AriaCheckbox, type CheckboxProps } from 'react-aria-components';
import css from './checkbox.module.css';

const styles = css as Record<'checkbox' | 'box', string>;

type Props = Omit<CheckboxProps, 'className' | 'style'>;

export function Checkbox({ children, ...props }: Props) {
	return (
		<AriaCheckbox {...props} className={styles.checkbox}>
			{(state) => (
				<>
					<span className={styles.box} aria-hidden="true" />
					{typeof children === 'function' ? children(state) : children}
				</>
			)}
		</AriaCheckbox>
	);
}
