import { Module } from '@nestjs/common';
import { FlexController } from './flex.controller';
import { FlexService } from './flex.service';

@Module({
	controllers: [FlexController],
	providers: [FlexService]
})
export class FlexModule {}
