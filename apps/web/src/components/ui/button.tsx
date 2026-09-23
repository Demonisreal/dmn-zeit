import type { Ref } from 'react';
import {
	Button as AriaButton,
	composeRenderProps,
	type ButtonProps as AriaButtonProps
} from 'react-aria-components';
import styles from './button.module.css';

type Props = Omit<AriaButtonProps, 'className' | 'style'> & {
	variant?: 'primary' | 'secondary' | 'quiet';
	ref?: Ref<HTMLButtonElement>;
};

export function Button({ variant = 'secondary', children, ...props }: Props) {
	return (
		<AriaButton {...props} className={`${styles.button} ${styles[variant]}`}>
			{composeRenderProps(children, (label, { isPending }) => (
				<>
					{isPending && <span className={styles.spinner} aria-hidden="true" />}
					{label}
				</>
			))}
		</AriaButton>
	);
}
