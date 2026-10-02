import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import type { Invoice } from '@zeit/shared';
import { Fragment, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '../../components/ui/button';
import { Notice } from '../../components/ui/notice';
import { PageHead } from '../../components/ui/page-shell';
import { Tag } from '../../components/ui/tag';
import { formatCents, formatDate, formatTaxRate } from '../../i18n/format';
import { todayIso } from '../../lib/dates';
import { flip } from '../../lib/sets';
import { useErrorText } from '../hr/error-text';
import styles from '../hr/ui/page.module.css';
import { markUnpaid } from './api';
import { CancelDialog } from './cancel-dialog';
import { LineDerivation, LineExemption, LineMeta } from './invoice-lines';
import lines from './invoice-lines.module.css';
import { InvoicePreview } from './invoice-preview';
import css from './invoice-view.module.css';
import { PaidDialog } from './paid-dialog';

const tones = {
	draft: 'pending',
	issued: 'neutral',
	paid: 'success',
	cancelled: 'neutral'
} as const;

type Props = {
	invoice: Invoice;
};

export function InvoiceView({ invoice }: Props) {
	const { t, i18n } = useTranslation('billing');
	const lng = i18n.language;
	const errorText = useErrorText();
	const queryClient = useQueryClient();
	const [expanded, setExpanded] = useState(() => new Set<string>());
	const [paying, setPaying] = useState(false);
	const [cancelling, setCancelling] = useState(false);

	const unmarkPaid = useMutation({
		mutationFn: () => markUnpaid(invoice.id),
		onSuccess: () => queryClient.invalidateQueries({ queryKey: ['invoices'] })
	});

	const payable = invoice.kind === 'invoice' && invoice.status !== 'cancelled';
	const overdue =
		payable &&
		invoice.status === 'issued' &&
		invoice.dueDate !== null &&
		invoice.dueDate < todayIso();
	const canCancel =
		(invoice.status === 'issued' || invoice.status === 'paid') && invoice.refersTo === null;
	const xrechnung = invoice.format === 'xrechnung';
	const hint = xrechnung ? 'invoice-xrechnung-hint' : undefined;

	return (
		<>
			<p className={styles.small}>
				<Link to="/billing">{t('invoiceView.back')}</Link>
			</p>
			<PageHead>
				<div>
					<h1 className={css.number}>{invoice.number ?? t('invoicesList.draftNumber')}</h1>
					<p className={styles.lead}>{invoice.buyer.name}</p>
					<p className={css.tags}>
						<Tag tone={tones[invoice.status]}>
							<span className={invoice.status === 'cancelled' ? css.struck : undefined}>
								{t(`invoicesList.statuses.${invoice.status}`)}
							</span>
						</Tag>
						{invoice.kind === 'cancellation' && <Tag>{t('invoiceView.cancellationTag')}</Tag>}
						{overdue && <Tag tone="warning">{t('invoicesList.overdue')}</Tag>}
					</p>
				</div>
			</PageHead>

			<div className={lines.layout}>
				<section className={lines.column} aria-labelledby="invoice-view-lines">
					<dl className={styles.facts}>
						<dt>{t('invoicesList.issueDate')}</dt>
						<dd className={styles.mono}>
							{invoice.issueDate ? formatDate(invoice.issueDate, lng) : '–'}
						</dd>
						{payable && (
							<>
								<dt>{t('invoicesList.dueDate')}</dt>
								<dd className={styles.mono}>
									{invoice.dueDate ? formatDate(invoice.dueDate, lng) : '–'}
								</dd>
							</>
						)}
						{invoice.taxProfile === 'regular' && (
							<>
								<dt>{t('invoiceView.net')}</dt>
								<dd className={`${styles.mono} ${css.figure}`}>
									{formatCents(invoice.totals.netCents, lng)}
								</dd>
								{invoice.taxGroups.map((group) => (
									<Fragment key={`${group.taxCategory}-${group.taxRateBp}`}>
										<dt>
											{group.taxCategory === 'standard' || group.taxCategory === 'reduced'
												? t('invoiceView.vat', { rate: formatTaxRate(group.taxRateBp, lng) })
												: t('invoiceView.vatWith', {
														rate: formatTaxRate(group.taxRateBp, lng),
														category: t(`invoiceEditor.taxCategories.${group.taxCategory}`)
													})}
										</dt>
										<dd className={`${styles.mono} ${css.figure}`}>
											{formatCents(group.taxCents, lng)}
										</dd>
									</Fragment>
								))}
							</>
						)}
						<dt>{t('invoiceView.gross')}</dt>
						<dd className={`${styles.mono} ${css.figure} ${css.gross}`}>
							{formatCents(invoice.totals.grossCents, lng)}
						</dd>
					</dl>

					{invoice.refersTo && (
						<Notice tone="info">
							{t('invoiceView.refersToOriginal', { number: invoice.refersTo.number ?? '' })}{' '}
							<Link to="/billing/invoices/$id" params={{ id: invoice.refersTo.id }}>
								{t('invoiceView.openReference')}
							</Link>
						</Notice>
					)}
					{invoice.cancellation && (
						<Notice tone="info">
							{t('invoiceView.refersToCancellation', { number: invoice.cancellation.number ?? '' })}{' '}
							<Link to="/billing/invoices/$id" params={{ id: invoice.cancellation.id }}>
								{t('invoiceView.openReference')}
							</Link>
						</Notice>
					)}

					{invoice.status === 'cancelled' && invoice.cancelReason && (
						<Notice>{t('invoiceView.cancelReason', { reason: invoice.cancelReason })}</Notice>
					)}

					<p className={styles.actions}>
						<a href={`/api/invoices/${invoice.id}/document`} download aria-describedby={hint}>
							{t('invoiceView.downloadPdf')}
						</a>
						{xrechnung && (
							<a href={`/api/invoices/${invoice.id}/xml`} download aria-describedby={hint}>
								{t('invoiceView.downloadXml')}
							</a>
						)}
					</p>
					{xrechnung && (
						<p id={hint} className={`${styles.small} ${styles.muted}`}>
							{t('invoiceView.xrechnungHint')}
						</p>
					)}

					<h2 id="invoice-view-lines">{t('invoiceEditor.positions')}</h2>
					{invoice.lines.length === 0 ? (
						<p className={`${styles.small} ${styles.muted}`}>{t('invoiceView.noLines')}</p>
					) : (
						<ul className={lines.list}>
							{invoice.lines.map((line) => {
								const open = expanded.has(line.id);
								return (
									<li key={line.id} className={lines.line}>
										<div className={lines.head}>
											<span className={lines.desc}>{line.description}</span>
											<span className={`${lines.amount} ${styles.mono}`}>
												{formatCents(line.netCents, lng)}
											</span>
										</div>
										<LineExemption line={line} />
										<LineMeta
											line={line}
											open={open}
											onToggle={() => setExpanded(flip(expanded, line.id))}
										/>
										{line.kind === 'time' && open && <LineDerivation line={line} />}
									</li>
								);
							})}
						</ul>
					)}

					{payable && (
						<section aria-labelledby="invoice-payment-title" className={css.status}>
							<h2 id="invoice-payment-title">{t('invoiceView.payment')}</h2>
							{invoice.status === 'issued' ? (
								<Button variant="secondary" onPress={() => setPaying(true)}>
									{t('invoiceView.markPaid')}
								</Button>
							) : (
								<>
									<p className={`${styles.small} ${styles.mono}`}>
										{t('invoiceView.paidOn', {
											date: invoice.paidOn ? formatDate(invoice.paidOn, lng) : ''
										})}
									</p>
									<Button
										variant="quiet"
										isPending={unmarkPaid.isPending}
										onPress={() => unmarkPaid.mutate()}
									>
										{t('invoiceView.markUnpaid')}
									</Button>
								</>
							)}
							{unmarkPaid.error && <Notice tone="error">{errorText(unmarkPaid.error)}</Notice>}
						</section>
					)}

					{canCancel && (
						<section aria-labelledby="invoice-cancel-title" className={css.status}>
							<h2 id="invoice-cancel-title">{t('invoiceView.cancelSection')}</h2>
							<Button variant="secondary" onPress={() => setCancelling(true)}>
								{t('invoiceView.cancel')}
							</Button>
						</section>
					)}
				</section>

				<section className={lines.previewPane} aria-label={t('preview.section')}>
					<InvoicePreview invoiceId={invoice.id} variant="issued" />
				</section>
			</div>

			<PaidDialog invoice={paying ? invoice : null} onClose={() => setPaying(false)} />
			<CancelDialog invoice={cancelling ? invoice : null} onClose={() => setCancelling(false)} />
		</>
	);
}
