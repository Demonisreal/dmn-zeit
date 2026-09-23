import { useNavigate } from '@tanstack/react-router';
import type { Session } from '@zeit/shared';
import { Menu, MenuItem, MenuTrigger, Popover } from 'react-aria-components';
import { useTranslation } from 'react-i18next';
import { Button } from '../components/ui/button';
import { useSignOut } from './use-sign-out';
import css from './user-menu.module.css';

// react-aria refuses className={undefined}, naming the classes keeps them typed as plain strings
const styles = css as Record<'caret' | 'popover' | 'who' | 'email' | 'menu' | 'item', string>;

type Props = {
	user: Session['user'];
};

export function UserMenu({ user }: Props) {
	const { t } = useTranslation(['common', 'nav']);
	const navigate = useNavigate();
	const signOut = useSignOut();

	return (
		<MenuTrigger>
			<Button variant="quiet" isPending={signOut.isPending}>
				{user.displayName}
				<span className={styles.caret} aria-hidden="true" />
			</Button>
			<Popover placement="bottom end" offset={6} className={styles.popover}>
				<div className={styles.who}>
					<span className={styles.email}>{user.email}</span>
					<span>{t(`roles.${user.role}`)}</span>
				</div>
				<Menu
					className={styles.menu}
					aria-label={t('account')}
					onAction={(key) =>
						key === 'logout' ? signOut.mutate() : void navigate({ to: '/sessions' })
					}
				>
					<MenuItem id="sessions" className={styles.item}>
						{t('nav:sessions')}
					</MenuItem>
					<MenuItem id="logout" className={styles.item}>
						{t('logout')}
					</MenuItem>
				</Menu>
			</Popover>
		</MenuTrigger>
	);
}
