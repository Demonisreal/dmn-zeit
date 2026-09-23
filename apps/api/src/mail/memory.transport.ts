import { MailTransport, type Mail } from './mail.transport';

export class MemoryTransport extends MailTransport {
	readonly sent: Mail[] = [];

	async send(mail: Mail): Promise<void> {
		this.sent.push(mail);
	}
}
