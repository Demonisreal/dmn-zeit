import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { RULESETS } from '@zeit/rules';
import type { AckFindingInput, Finding, FindingsQuery, RuleSetInfo } from '@zeit/shared';
import { Clock } from '../common/clock';
import { assertCanSee } from '../common/scope';
import type { AuthSession } from '../common/session.guard';
import { Database, type Trx } from '../db/database';
import { buildDays } from '../time/day-engine';
import { TimeStore, type DateRange } from '../time/time.store';
import { ComplianceStore } from './compliance.store';

@Injectable()
export class ComplianceService {
	constructor(
		private readonly db: Database,
		private readonly store: ComplianceStore,
		private readonly time: TimeStore,
		private readonly clock: Clock
	) {}

	findings(session: AuthSession, query: FindingsQuery): Promise<Finding[]> {
		return this.db.withTenant(session, async (trx) => {
			let employeeIds: string[];
			if (query.employee) {
				await assertCanSee(trx, session, query.employee);
				employeeIds = [query.employee];
			} else {
				employeeIds = await this.store.reviewable(trx, session, query);
			}

			const findings = await this.compute(trx, employeeIds, query);
			return findings
				.filter((finding) => !query.state || (finding.ack === null) === (query.state === 'open'))
				.sort(
					(a, b) =>
						a.date.localeCompare(b.date) ||
						a.employee.name.localeCompare(b.employee.name) ||
						a.code.localeCompare(b.code)
				);
		});
	}

	ack(session: AuthSession, input: AckFindingInput): Promise<Finding> {
		return this.db.withTenant(session, async (trx) => {
			await assertCanSee(trx, session, input.employeeId);
			if (input.employeeId === session.employeeId) {
				throw new ForbiddenException('Nobody acknowledges findings on their own times');
			}
			await this.finding(trx, input);
			await this.store.ack(trx, session, input);
			return this.finding(trx, input);
		});
	}

	ruleVersions(): RuleSetInfo[] {
		return RULESETS.map((set) => ({
			version: set.version,
			validFrom: set.validFrom.toString(),
			limits: { ...set.limits }
		}));
	}

	// findings live nowhere but here, they are worked out from the entries on every request
	private async compute(trx: Trx, employeeIds: string[], range: DateRange): Promise<Finding[]> {
		const { tenant, sheets } = await this.time.sheets(trx, employeeIds, range);
		const now = this.clock.now();
		return [...sheets.values()].flatMap((sheet) => {
			const employee = { id: sheet.employee.id, name: sheet.employee.name };
			return buildDays(sheet, tenant, range, now).flatMap((day) =>
				day.findings.map((finding) => ({ employee, date: day.date, ...finding }))
			);
		});
	}

	private async finding(trx: Trx, input: AckFindingInput): Promise<Finding> {
		const findings = await this.compute(trx, [input.employeeId], {
			from: input.date,
			to: input.date
		});
		const finding = findings.find(
			(candidate) => candidate.code === input.code && candidate.ruleVersion === input.ruleVersion
		);
		if (!finding) throw new NotFoundException('No such finding on that day');
		return finding;
	}
}
