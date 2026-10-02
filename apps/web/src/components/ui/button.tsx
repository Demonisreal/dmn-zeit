import { createLink } from '@tanstack/react-router';
import type { Ref } from 'react';
import {
	Button as AriaButton,
	Link as AriaLink,
	composeRenderProps,
	type ButtonProps as AriaButtonProps,
	type LinkProps as AriaLinkProps
} from 'react-aria-components';
import styles from './button.module.css';

type Variant = 'primary' | 'secondary' | 'quiet';

type Props = Omit<AriaButtonProps, 'className' | 'style'> & {
	variant?: Variant;
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

type LinkProps = Omit<AriaLinkProps, 'className' | 'style'> & {
	variant?: Variant;
	ref?: Ref<HTMLAnchorElement>;
};

function StyledLink({ variant = 'secondary', ...props }: LinkProps) {
	return <AriaLink {...props} className={`${styles.button} ${styles.link} ${styles[variant]}`} />;
}

export const ButtonLink = createLink(StyledLink);
