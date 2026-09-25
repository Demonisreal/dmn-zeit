import { Body, Controller, Get, HttpCode, Post, Req, Res, UseGuards } from '@nestjs/common';
import { createSandboxSchema, switchPersonaSchema } from '@zeit/shared';
import type {
	CreateSandboxInput,
	OutboxMail,
	Persona,
	Session,
	SwitchPersonaInput
} from '@zeit/shared';
import type { Request, Response } from 'express';
import { CurrentClient, type Client } from '../common/client.decorator';
import { CurrentSession } from '../common/current-session.decorator';
import { Public, type AuthSession } from '../common/session.guard';
import { ZodPipe } from '../common/zod.pipe';
import { DemoService } from './demo.service';
import { InDemoGuard } from './in-demo.guard';

@UseGuards(InDemoGuard)
@Controller('demo')
export class DemoController {
	constructor(private readonly demo: DemoService) {}

	@Post('sandboxes')
	@Public()
	create(
		@Body(new ZodPipe(createSandboxSchema)) body: CreateSandboxInput,
		@CurrentClient() client: Client,
		@Res({ passthrough: true }) response: Response
	): Promise<Session> {
		return this.demo.create(body, client, response);
	}

	@Get('personas')
	personas(@CurrentSession() session: AuthSession): Promise<Persona[]> {
		return this.demo.personas(session);
	}

	@Post('switch')
	@HttpCode(200)
	switchTo(
		@Body(new ZodPipe(switchPersonaSchema)) body: SwitchPersonaInput,
		@Req() request: Request,
		@Res({ passthrough: true }) response: Response
	): Promise<Session> {
		return this.demo.switchTo(body.userId, request, response);
	}

	@Get('outbox')
	outbox(@CurrentSession() session: AuthSession): Promise<OutboxMail[]> {
		return this.demo.outbox(session);
	}
}
