import { MailTransport, type Mail } from './mail.transport';

export class ResendTransport extends MailTransport {
	constructor(
		private readonly apiKey: string,
		private readonly from: string
	) {
		super();
	}

	async send(mail: Mail): Promise<void> {
		const reply = await fetch('https://api.resend.com/emails', {
			method: 'POST',
			headers: { Authorization: `Bearer ${this.apiKey}`, 'Content-Type': 'application/json' },
			body: JSON.stringify({
				from: this.from,
				to: [mail.to],
				subject: mail.subject,
				text: mail.text
			}),
			signal: AbortSignal.timeout(10_000)
		});
		if (!reply.ok) {
			throw new Error(`Resend answered ${reply.status}: ${await reply.text()}`);
		}
	}
}
