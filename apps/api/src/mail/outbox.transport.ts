import type { Database } from '../db/database';
import { MailTransport, type Mail } from './mail.transport';

// the demo sends nothing out, visitors read their mails in the outbox of their sandbox
export class OutboxTransport extends MailTransport {
	constructor(private readonly db: Database) {
		super();
	}

	async send(mail: Mail): Promise<void> {
		await this.db
			.insertInto('ops.demo_outbox')
			.values({
				tenant_id: mail.tenantId,
				recipient: mail.to,
				subject: mail.subject,
				body: mail.text
			})
			.execute();
	}
}
