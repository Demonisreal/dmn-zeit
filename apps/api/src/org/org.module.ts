import { Module } from '@nestjs/common';
import { EmployeesController } from './employees.controller';
import { EmployeesService } from './employees.service';
import { TeamsController } from './teams.controller';
import { TeamsService } from './teams.service';
import { WorkModelsController } from './work-models.controller';
import { WorkModelsService } from './work-models.service';

@Module({
	controllers: [EmployeesController, WorkModelsController, TeamsController],
	providers: [EmployeesService, WorkModelsService, TeamsService]
})
export class OrgModule {}
