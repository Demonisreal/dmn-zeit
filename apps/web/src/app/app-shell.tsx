import { Link } from '@tanstack/react-router';
import type { Session } from '@zeit/shared';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '../components/ui/button';
import styles from './app-shell.module.css';
import { Brand } from './brand';
import { DemoSwitch } from './demo-switch';
import { LangSwitch } from './lang-switch';
import { MainNav } from './main-nav';
import { UserMenu } from './user-menu';
import { useSignOut } from './use-sign-out';

type Props = {
	session: Session;
	children: ReactNode;
};

export function AppShell({ session, children }: Props) {
	const { t } = useTranslation(['common', 'nav']);
	const [open, setOpen] = useState(false);
	const toggle = useRef<HTMLButtonElement>(null);
	const signOut = useSignOut();
	const close = () => setOpen(false);

	// on the document, safari does not focus a button on click, so the key may come from body
	useEffect(() => {
		if (!open) return;
		const onKey = (e: KeyboardEvent) => {
			if (e.key !== 'Escape') return;
			setOpen(false);
			toggle.current?.focus();
		};
		document.addEventListener('keydown', onKey);
		return () => document.removeEventListener('keydown', onKey);
	}, [open]);

	return (
		<div className={styles.shell}>
			<a className={styles.skip} href="#main">
				{t('skipToContent')}
			</a>
			<header className={styles.head}>
				<div className={styles.brand}>
					<Brand />
				</div>
				<p className={styles.tenant}>{session.tenant.name}</p>
				<div className={styles.tools}>
					<DemoSwitch />
					<LangSwitch />
					<UserMenu user={session.user} />
				</div>
				<span className={styles.toggle}>
					<Button
						ref={toggle}
						variant="quiet"
						aria-expanded={open}
						aria-controls="app-nav"
						onPress={() => setOpen(!open)}
					>
						{t('menu')}
					</Button>
				</span>
			</header>
			<nav
				id="app-nav"
				className={styles.nav}
				data-open={open || undefined}
				aria-label={t('nav:label')}
			>
				<MainNav role={session.user.role} onNavigate={close} />
				{/* on narrow screens the header has no room, so language and account move in here */}
				<div className={styles.more}>
					<p className={styles.who}>
						{session.user.displayName}
						<span>{t(`roles.${session.user.role}`)}</span>
					</p>
					<DemoSwitch />
					<div className={styles.lang}>
						<LangSwitch />
					</div>
					<Link to="/security" className={styles.moreLink} onClick={close}>
						{t('nav:security')}
					</Link>
					<Link to="/sessions" className={styles.moreLink} onClick={close}>
						{t('nav:sessions')}
					</Link>
					<Button
						variant="secondary"
						isPending={signOut.isPending}
						onPress={() => signOut.mutate()}
					>
						{t('logout')}
					</Button>
				</div>
			</nav>
			<main id="main" tabIndex={-1} className={styles.main}>
				{children}
			</main>
		</div>
	);
}
