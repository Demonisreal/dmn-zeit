import { Global, Module } from '@nestjs/common';
import { Audit } from './audit';
import { Clock } from './clock';

@Global()
@Module({
	providers: [Clock, Audit],
	exports: [Clock, Audit]
})
export class CommonModule {}
