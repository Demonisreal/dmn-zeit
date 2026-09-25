import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import { roles, type Persona, type Role } from '@zeit/shared';
import { useState } from 'react';
import { Menu, MenuItem, MenuTrigger, Popover, Text } from 'react-aria-components';
import { useTranslation } from 'react-i18next';
import { errorKey } from '../../app/error-key';
import { Button } from '../../components/ui/button';
import { sessionQuery } from '../../lib/api/auth';
import { personasQuery, switchPersona } from '../../lib/api/demo';
import css from './demo.module.css';

// react-aria refuses className={undefined}, naming the classes keeps them typed as plain strings
const styles = css as Record<
	'caret' | 'popover' | 'menu' | 'persona' | 'role' | 'name' | 'status' | 'error',
	string
>;

const byRole = (a: Persona, b: Persona) => roles.indexOf(a.role) - roles.indexOf(b.role);

// each role lands where its part of the demo is waiting
const startPage = {
	employee: '/',
	team_lead: '/inbox',
	hr: '/hr/months',
	admin: '/'
} as const satisfies Record<Role, string>;

export function PersonaMenu() {
	const { t } = useTranslation(['demo', 'common']);
	const queryClient = useQueryClient();
	const navigate = useNavigate();
	const [open, setOpen] = useState(false);
	const personas = useQuery({ ...personasQuery, enabled: open });

	const change = useMutation({
		mutationFn: (persona: Persona) => switchPersona({ userId: persona.userId }),
		onSuccess: async (_, persona) => {
			await queryClient.invalidateQueries({ queryKey: sessionQuery.queryKey });
			// everything else in the cache was loaded for the previous persona
			queryClient.removeQueries({
				predicate: (query) => query.queryKey[0] !== sessionQuery.queryKey[0]
			});
			setOpen(false);
			await navigate({ to: startPage[persona.role] });
		}
	});

	const cast = personas.data?.toSorted(byRole) ?? [];
	const current = cast.find((persona) => persona.current);

	const toggle = (next: boolean) => {
		// otherwise the last failed attempt still shows when the menu opens again
		if (next) change.reset();
		setOpen(next);
	};

	return (
		<MenuTrigger isOpen={open} onOpenChange={toggle}>
			<Button variant="quiet" isPending={change.isPending}>
				{t('switch.label')}
				<span className={styles.caret} aria-hidden="true" />
			</Button>
			<Popover placement="bottom end" offset={6} className={styles.popover}>
				<Menu
					className={styles.menu}
					items={cast}
					selectionMode="single"
					selectedKeys={current ? [current.userId] : []}
					disallowEmptySelection
					// stays open until the new session is there, a failed switch shows its error below
					shouldCloseOnSelect={false}
					disabledKeys={change.isPending ? cast.map((persona) => persona.userId) : []}
					onAction={(userId) => {
						const next = cast.find((persona) => persona.userId === userId);
						if (next && !next.current) change.mutate(next);
					}}
					renderEmptyState={() => (
						<p className={styles.status}>
							{personas.isError ? t(errorKey(personas.error)) : t('switch.loading')}
						</p>
					)}
				>
					{(persona) => (
						<MenuItem
							id={persona.userId}
							textValue={t(`common:roles.${persona.role}`)}
							className={styles.persona}
						>
							<Text slot="label" className={styles.role}>
								{t(`common:roles.${persona.role}`)}
							</Text>
							<Text slot="description" className={styles.name}>
								{persona.displayName}
							</Text>
						</MenuItem>
					)}
				</Menu>
				{change.isError && (
					<p className={styles.error} role="alert">
						{t(errorKey(change.error))}
					</p>
				)}
			</Popover>
		</MenuTrigger>
	);
}
