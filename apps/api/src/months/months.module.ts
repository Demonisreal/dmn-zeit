import { Module } from '@nestjs/common';
import { TimeModule } from '../time/time.module';
import { MonthsController } from './months.controller';
import { MonthsService } from './months.service';
import { MonthsStore } from './months.store';

@Module({
	imports: [TimeModule],
	controllers: [MonthsController],
	providers: [MonthsStore, MonthsService],
	// exports read closed months from the snapshot and open ones from the same figures as the close
	exports: [MonthsStore, MonthsService]
})
export class MonthsModule {}
