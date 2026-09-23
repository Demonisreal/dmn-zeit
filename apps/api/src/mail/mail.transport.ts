export type Mail = {
	// only the demo outbox needs it, it shows each sandbox its own mails
	tenantId: string;
	to: string;
	subject: string;
	text: string;
};

// a class rather than an interface, so nest can inject by it
export abstract class MailTransport {
	abstract send(mail: Mail): Promise<void>;
}
