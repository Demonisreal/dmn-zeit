import { ConflictException, Injectable } from '@nestjs/common';
import { isBillable } from '@zeit/rules';
import type { BudgetStatus, ProjectEntry, ProjectTimer, StartTimerInput } from '@zeit/shared';
import { Clock } from '../common/clock';
import type { AuthSession } from '../common/session.guard';
import { Database, type Trx } from '../db/database';
import { employeeOf } from '../time/clock.service';
import { runningBudget, timerOf } from './project-engine';
import { ProjectEntriesStore } from './project-entries.store';
import { ProjectsStore } from './projects.store';

@Injectable()
export class ProjectTimerService {
	constructor(
		private readonly db: Database,
		private readonly entries: ProjectEntriesStore,
		private readonly projects: ProjectsStore,
		private readonly clock: Clock
	) {}

	state(session: AuthSession): Promise<ProjectTimer> {
		const employeeId = employeeOf(session);
		return this.db.withTenant(session, (trx) => this.current(trx, employeeId));
	}

	// both stamps are now() of one transaction, the old range ends exactly where the new one starts
	start(session: AuthSession, input: StartTimerInput): Promise<ProjectTimer> {
		const employeeId = employeeOf(session);
		return this.db.withTenant(session, async (trx) => {
			await this.entries.stopRunning(trx, employeeId);
			await this.entries.startTimer(trx, session, employeeId, input);
			return this.current(trx, employeeId);
		});
	}

	stop(session: AuthSession, note: string | undefined): Promise<ProjectTimer> {
		const employeeId = employeeOf(session);
		return this.db.withTenant(session, async (trx) => {
			if (!(await this.entries.stopRunning(trx, employeeId, note))) {
				throw new ConflictException('No project timer running');
			}
			return this.current(trx, employeeId);
		});
	}

	private async current(trx: Trx, employeeId: string): Promise<ProjectTimer> {
		const running = await this.entries.running(trx, employeeId);
		const now = this.clock.now();
		return timerOf(running, running ? await this.budget(trx, running, now) : null, now);
	}

	private async budget(trx: Trx, running: ProjectEntry, now: Date): Promise<BudgetStatus | null> {
		const status = await this.projects.budgetStatus(trx, running.projectId);
		if (!status || status.budgetMinutes === null) return null;
		// project and tasks are closed below hr, the bookable list is the one place with their flags
		const project = (await this.projects.bookable(trx)).find((p) => p.id === running.projectId);
		const task = project?.tasks.find((t) => t.id === running.taskId) ?? null;
		const billable = isBillable(running, task, project ?? { billable: true });
		return runningBudget(
			{ budgetMinutes: status.budgetMinutes, usedMinutes: status.usedMinutes },
			running,
			billable,
			now
		);
	}
}
