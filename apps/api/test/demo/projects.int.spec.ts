import type { Persona, Project, ProjectTimer, ProjectWeek } from '@zeit/shared';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Browser } from '../auth/api';
import { openSandbox, startDemo, type Demo } from './sandbox';

let demo: Demo;

beforeAll(async () => {
	demo = await startDemo();
});

afterAll(() => demo.app.close());

async function switchTo(visitor: Browser, pick: (persona: Persona) => boolean) {
	const personas = (await visitor.get('/demo/personas')).body as Persona[];
	const answer = await visitor.post('/demo/switch', { userId: personas.find(pick)!.userId });
	expect(answer.status).toBe(200);
	visitor.remember(answer);
}

const states = (projects: Project[]) => projects.map((project) => project.budget!.state).sort();

describe('project time in the demo office', () => {
	it('finds the timer of the employee persona running', async () => {
		const { visitor } = await openSandbox(demo);
		const timer = (await visitor.get('/project-timer')).body as ProjectTimer;
		expect(timer).toMatchObject({ state: 'running' });
	});

	it('shows her the day with more project time than she was clocked in', async () => {
		const { visitor, session } = await openSandbox(demo);
		const { rows } = await demo.superuser.query<{ day: string }>(
			`select to_char(max((started_at at time zone 'Europe/Berlin')::date), 'YYYY-MM-DD') as day
			   from app.time_entries where employee_id = $1 and ended_at is not null`,
			[session.user.employeeId]
		);
		const week = await visitor.get(
			`/employees/${session.user.employeeId}/project-week?from=${rows[0]!.day}`
		);
		expect(week.status).toBe(200);
		const day = (week.body as ProjectWeek).coverage!.find(
			(coverage) => coverage.date === rows[0]!.day
		)!;
		expect(day.hints).toContain('PROJECT_OVER_WORKED');
		expect(day.projectMinutes).toBeGreaterThan(day.workedMinutes);
	});

	it('shows hr one closing near its budget and one beyond it', async () => {
		const { visitor } = await openSandbox(demo);
		await switchTo(visitor, (persona) => persona.role === 'hr');
		const budgets = await visitor.get('/projects/budgets');
		expect(budgets.status).toBe(200);
		expect(states(budgets.body as Project[])).toEqual(['exceeded', 'warn']);
	});
});

describe('the freelancer of the demo', () => {
	let visitor: Browser;

	beforeAll(async () => {
		({ visitor } = await openSandbox(demo));
		await switchTo(visitor, (persona) => persona.workspace === 'solo');
	});

	it('works for her four clients, one of them billed in english', async () => {
		const clients = await visitor.get('/clients');
		expect(clients.status).toBe(200);
		expect(clients.body).toHaveLength(4);
		expect(
			(clients.body as { invoiceLocale: string }[]).filter(
				(client) => client.invoiceLocale === 'en'
			)
		).toHaveLength(1);
	});

	it('sees one project near its budget and one beyond it', async () => {
		expect(states((await visitor.get('/projects/budgets')).body as Project[])).toEqual([
			'exceeded',
			'warn'
		]);
	});

	it('finds her timer running and stops it', async () => {
		expect((await visitor.get('/project-timer')).body).toMatchObject({ state: 'running' });
		expect((await visitor.post('/project-timer/stop')).status).toBe(200);
		expect((await visitor.get('/project-timer')).body).toEqual({ state: 'idle' });
	});
});
