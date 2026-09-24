import { Module } from '@nestjs/common';
import { MailModule } from '../mail/mail.module';
import { MeController } from './me.controller';
import { UsersController } from './users.controller';
import { UsersService } from './users.service';

@Module({
	imports: [MailModule],
	controllers: [UsersController, MeController],
	providers: [UsersService]
})
export class UsersModule {}
