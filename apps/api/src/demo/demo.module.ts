import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { DemoController } from './demo.controller';
import { DemoService } from './demo.service';
import { DemoStore } from './demo.store';

@Module({
	imports: [AuthModule],
	controllers: [DemoController],
	providers: [DemoStore, DemoService]
})
export class DemoModule {}
