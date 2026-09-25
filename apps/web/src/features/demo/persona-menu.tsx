import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import { roles, type Persona, type Role } from '@zeit/shared';
import { useState } from 'react';
import {
	Header,
	Menu,
	MenuItem,
	MenuSection,
	MenuTrigger,
	Popover,
	Text
} from 'react-aria-components';
import { useTranslation } from 'react-i18next';
import { errorKey } from '../../app/error-key';
import { Button } from '../../components/ui/button';
import { sessionQuery } from '../../lib/api/auth';
import { personasQuery, switchPersona } from '../../lib/api/demo';
import css from './demo.module.css';

// react-aria refuses className={undefined}, naming the classes keeps them typed as plain strings
const styles = css as Record<
	| 'caret'
	| 'popover'
	| 'menu'
	| 'persona'
	| 'role'
	| 'name'
	| 'others'
	| 'more'
	| 'fold'
	| 'group'
	| 'team'
	| 'status'
	| 'error',
	string
>;

const byName = (a: Persona, b: Persona) => a.displayName.localeCompare(b.displayName);

const byTeam = (a: Persona, b: Persona) =>
	a.team && b.team ? a.team.name.localeCompare(b.team.name) : Number(!a.team) - Number(!b.team);

// each role lands where its part of the demo is waiting
const startPage = {
	employee: '/',
	team_lead: '/inbox',
	hr: '/hr/months',
	admin: '/'
} as const satisfies Record<Role, string>;

function arrange(cast: Persona[]) {
	const sorted = cast.toSorted(byName);
	// the persona in use keeps her place up top, the checked entry never hides in the fold
	const main = roles.flatMap((role) => {
		const own = sorted.filter((persona) => persona.role === role);
		const pick = own.find((persona) => persona.current) ?? own[0];
		return pick ? [pick] : [];
	});

	const teams: Persona[][] = [];
	// the sort is stable, so every team arrives as one run still ordered by name
	for (const persona of sorted.filter((p) => !main.includes(p)).toSorted(byTeam)) {
		const last = teams.at(-1);
		if (last && last[0]!.team?.id === persona.team?.id) last.push(persona);
		else teams.push([persona]);
	}
	return { main, teams };
}

export function PersonaMenu() {
	const { t } = useTranslation(['demo', 'common']);
	const queryClient = useQueryClient();
	const navigate = useNavigate();
	const [open, setOpen] = useState(false);
	const [expanded, setExpanded] = useState(false);
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

	const cast = personas.data ?? [];
	const { main, teams } = arrange(cast);
	const current = main.find((persona) => persona.current);

	const toggle = (next: boolean) => {
		// otherwise the last failed attempt still shows when the menu opens again
		if (next) change.reset();
		setOpen(next);
	};

	const pick = (persona: Persona) => {
		if (!persona.current) change.mutate(persona);
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
					selectionMode="single"
					selectedKeys={current ? [current.userId] : []}
					disallowEmptySelection
					// stays open until the new session is there, a failed switch shows its error below
					shouldCloseOnSelect={false}
					disabledKeys={change.isPending ? cast.map((persona) => persona.userId) : []}
					renderEmptyState={() => (
						<p className={styles.status}>
							{personas.isError ? t(errorKey(personas.error)) : t('switch.loading')}
						</p>
					)}
				>
					{main.map((persona) => (
						<MenuItem
							key={persona.userId}
							id={persona.userId}
							textValue={t(`common:roles.${persona.role}`)}
							className={styles.persona}
							onAction={() => pick(persona)}
						>
							<Text slot="label" className={styles.role}>
								{t(`common:roles.${persona.role}`)}
							</Text>
							<Text slot="description" className={styles.name}>
								{persona.displayName}
							</Text>
						</MenuItem>
					))}
					{teams.length > 0 && (
						<MenuSection
							// a section of its own, so the toggle is a plain menuitem and not one more radio
							selectionMode="none"
							className={styles.others}
						>
							<MenuItem
								id="others"
								textValue={t('switch.others')}
								aria-expanded={expanded}
								className={styles.more}
								onAction={() => setExpanded(!expanded)}
							>
								<span className={styles.fold} aria-hidden="true" />
								{t('switch.others')}
							</MenuItem>
						</MenuSection>
					)}
					{expanded &&
						teams.map((members) => {
							const team = members[0]!.team;
							return (
								<MenuSection
									key={team?.id ?? 'none'}
									id={team?.id ?? 'none'}
									className={styles.group}
								>
									<Header className={styles.team}>{team?.name ?? t('switch.noTeam')}</Header>
									{members.map((persona) => (
										<MenuItem
											key={persona.userId}
											id={persona.userId}
											textValue={persona.displayName}
											className={styles.persona}
											onAction={() => pick(persona)}
										>
											<Text slot="label" className={styles.name}>
												{persona.displayName}
											</Text>
											<Text slot="description" className={styles.role}>
												{t(`common:roles.${persona.role}`)}
											</Text>
										</MenuItem>
									))}
								</MenuSection>
							);
						})}
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
