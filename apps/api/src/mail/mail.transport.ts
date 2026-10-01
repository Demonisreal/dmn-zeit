export type Mail = {
	tenantId: string;
	to: string;
	subject: string;
	text: string;
};

export abstract class MailTransport {
	abstract send(mail: Mail): Promise<void>;
}
