import { Module } from '@nestjs/common';
import { ClockController } from './clock.controller';
import { ClockService } from './clock.service';
import { TimeController } from './time.controller';
import { TimeService } from './time.service';
import { TimeStore } from './time.store';

@Module({
	controllers: [ClockController, TimeController],
	providers: [TimeStore, TimeService, ClockService],
	// compliance, month closing and exports build their days from the same store
	exports: [TimeStore, TimeService]
})
export class TimeModule {}
