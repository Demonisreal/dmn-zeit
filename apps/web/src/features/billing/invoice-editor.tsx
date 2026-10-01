import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Link, useNavigate } from '@tanstack/react-router';
import { taxTreatment } from '@zeit/rules';
import {
	hasRole,
	invoiceLineInputSchema,
	invoiceLineUnits,
	taxCategories,
	type Invoice,
	type InvoiceLine,
	type InvoiceLineInput,
	type Role,
	type TaxCategory
} from '@zeit/shared';
import type { TFunction } from 'i18next';
import type { ReactNode } from 'react';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { z } from 'zod';
import { Button } from '../../components/ui/button';
import { ConfirmDialog } from '../../components/ui/confirm-dialog';
import { FormField, FormTextArea, TextAreaField } from '../../components/ui/field';
import { Notice } from '../../components/ui/notice';
import { PageHead } from '../../components/ui/page-shell';
import { FormSelect } from '../../components/ui/select-field';
import { formatCents } from '../../i18n/format';
import { flip } from '../../lib/sets';
import { useErrorText } from '../hr/error-text';
import { DateInputField } from '../hr/ui/date-field';
import styles from '../hr/ui/page.module.css';
import {
	addLine,
	deleteInvoice,
	refreshDraft,
	removeLine,
	updateDraft,
	updateLine
} from './api';
import { centsField, quantityField, quantityToText } from './fields';
import css from './invoice-editor.module.css';
import { LineDerivation, LineMeta } from './invoice-lines';
import lines from './invoice-lines.module.css';
import { InvoicePreview } from './invoice-preview';
import { IssueDialog } from './issue-dialog';

// reduced and exempt are the only per-position choices, see taxTreatment in @zeit/rules
const itemTaxCategories = ['standard', 'reduced', 'exempt'] as const;
const lineFields = invoiceLineInputSchema.shape;

const lineSchema = z.object({
	description: lineFields.description,
	quantityMilli: quantityField,
	unit: lineFields.unit,
	unitPriceCents: centsField,
	taxCategory: z.enum(taxCategories)
});

type LineFormValues = z.input<typeof lineSchema>;

const centsToText = (cents: string) => (Number(cents) / 100).toFixed(2).replace('.', ',');

const lineDefaults = (line: InvoiceLine): LineFormValues => ({
	description: line.description,
	quantityMilli: quantityToText(line.quantityMilli ?? '0'),
	unit: line.unit ?? 'C62',
	unitPriceCents: centsToText(line.unitPriceCents ?? '0'),
	taxCategory: line.taxCategory
});

const unitOptions = (t: TFunction<'billing'>) =>
	invoiceLineUnits.map((unit) => ({ id: unit, label: t(`invoiceEditor.units.${unit}`) }));

type LineFormProps = {
	label: string;
	defaultValues: LineFormValues;
	taxChoices: readonly TaxCategory[];
	submitLabel: string;
	pending: boolean;
	error: ReactNode;
	onSubmit: (input: InvoiceLineInput) => void;
	onCancel: () => void;
};

function ItemLineForm({
	label,
	defaultValues,
	taxChoices,
	submitLabel,
	pending,
	error,
	onSubmit,
	onCancel
}: LineFormProps) {
	const { t } = useTranslation('billing');
	const { control, handleSubmit } = useForm({ resolver: zodResolver(lineSchema), defaultValues });

	return (
		<form
			className={styles.panel}
			noValidate
			aria-label={label}
			onSubmit={handleSubmit((values) => onSubmit(values))}
		>
			<div className={styles.fields}>
				<div className={styles.wide}>
					<FormTextArea
						control={control}
						name="description"
						label={t('invoiceEditor.itemDescription')}
						rows={2}
						autoFocus
					/>
				</div>
				<FormField
					control={control}
					name="quantityMilli"
					label={t('invoiceEditor.quantity')}
					inputMode="decimal"
				/>
				<FormSelect control={control} name="unit" label={t('invoiceEditor.unit')} options={unitOptions(t)} />
				<FormField
					control={control}
					name="unitPriceCents"
					label={t('invoiceEditor.unitPrice')}
					description={t('invoiceEditor.unitPriceHint')}
					inputMode="decimal"
				/>
				<FormSelect
					control={control}
					name="taxCategory"
					label={t('invoiceEditor.taxCategory')}
					options={taxChoices.map((category) => ({
						id: category,
						label: t(`invoiceEditor.taxCategories.${category}`)
					}))}
				/>
			</div>
			{error}
			<div className={styles.actions}>
				<Button type="submit" variant="primary" isPending={pending}>
					{submitLabel}
				</Button>
				<Button variant="quiet" isDisabled={pending} onPress={onCancel}>
					{t('cancel')}
				</Button>
			</div>
		</form>
	);
}

type Props = {
	invoice: Invoice;
	role: Role;
	// when the query last got an answer; line changes leave invoice.updatedAt alone
	previewKey: number;
};

export function InvoiceEditor({ invoice, role, previewKey }: Props) {
	const { t, i18n } = useTranslation('billing');
	const lng = i18n.language;
	const navigate = useNavigate();
	const errorText = useErrorText();
	const queryClient = useQueryClient();

	const [range, setRange] = useState({ from: invoice.serviceFrom, to: invoice.serviceTo });
	const [addingLine, setAddingLine] = useState(false);
	const [editingLineId, setEditingLineId] = useState<string | null>(null);
	const [descEdit, setDescEdit] = useState<{ lineId: string; value: string } | null>(null);
	const [expanded, setExpanded] = useState(() => new Set<string>());
	const [removingLine, setRemovingLine] = useState<InvoiceLine | null>(null);
	const [issuing, setIssuing] = useState(false);
	const [discarding, setDiscarding] = useState(false);

	// a small business or an EU client with a VAT ID fixes the category for the whole invoice
	const treatment = taxTreatment({ taxProfile: invoice.taxProfile }, invoice.buyer);
	const taxChoices: readonly TaxCategory[] = treatment === 'standard' ? itemTaxCategories : [treatment];

	const reload = (...more: string[]) =>
		Promise.all(
			['invoices', ...more].map((key) => queryClient.invalidateQueries({ queryKey: [key] }))
		);

	const patchDraft = useMutation({
		mutationFn: () => updateDraft(invoice.id, range),
		onSuccess: () => reload('unbilled')
	});
	const refresh = useMutation({
		mutationFn: () => refreshDraft(invoice.id),
		onSuccess: () => reload('unbilled')
	});

	const addItem = useMutation({
		mutationFn: (input: InvoiceLineInput) => addLine(invoice.id, input),
		onSuccess: async () => {
			await reload();
			setAddingLine(false);
		}
	});
	const editItem = useMutation({
		mutationFn: ({ lineId, input }: { lineId: string; input: InvoiceLineInput }) =>
			updateLine(invoice.id, lineId, input),
		onSuccess: async () => {
			await reload();
			setEditingLineId(null);
		}
	});
	// a time position only lets its text change, the api refuses anything else
	const editText = useMutation({
		mutationFn: ({ lineId, description }: { lineId: string; description: string }) =>
			updateLine(invoice.id, lineId, { description }),
		onSuccess: async () => {
			await reload();
			setDescEdit(null);
		}
	});
	const removeItem = useMutation({
		mutationFn: (lineId: string) => removeLine(invoice.id, lineId),
		onSuccess: async () => {
			await reload('unbilled');
			setRemovingLine(null);
		}
	});

	const discard = useMutation({
		mutationFn: () => deleteInvoice(invoice.id),
		onSuccess: async () => {
			// leave first, otherwise the refetch asks for the invoice that is gone
			await navigate({ to: '/billing' });
			await reload('revenue', 'unbilled');
		}
	});

	const rangeDirty = range.from !== invoice.serviceFrom || range.to !== invoice.serviceTo;
	const rangeFilled = range.from !== '' && range.to !== '';

	return (
		<>
			<p className={styles.small}>
				<Link to="/billing">{t('invoiceEditor.back')}</Link>
			</p>
			<PageHead>
				<div>
					<h1>{invoice.buyer.name}</h1>
					<p className={styles.lead}>{t('invoiceEditor.draftLead')}</p>
				</div>
			</PageHead>

			<div className={lines.layout}>
				<section className={lines.column} aria-labelledby="invoice-lines-title">
					<h2 id="invoice-lines-title">{t('invoiceEditor.positions')}</h2>

					<div className={css.period}>
						<DateInputField
							label={t('from')}
							value={range.from}
							onChange={(from) => setRange((r) => ({ ...r, from }))}
						/>
						<DateInputField
							label={t('to')}
							value={range.to}
							onChange={(to) => setRange((r) => ({ ...r, to }))}
						/>
						<Button
							variant="secondary"
							isPending={patchDraft.isPending}
							isDisabled={!rangeDirty || !rangeFilled}
							onPress={() => patchDraft.mutate()}
						>
							{t('save')}
						</Button>
						<Button variant="quiet" isPending={refresh.isPending} onPress={() => refresh.mutate()}>
							{t('invoiceEditor.refresh')}
						</Button>
					</div>
					{patchDraft.error && <Notice tone="error">{errorText(patchDraft.error)}</Notice>}
					{refresh.error && <Notice tone="error">{errorText(refresh.error)}</Notice>}

					<dl className={styles.facts}>
						<dt>{t('client.invoiceLocale')}</dt>
						<dd>{t(`client.locales.${invoice.locale}`)}</dd>
					</dl>

					{invoice.lines.length === 0 ? (
						<p className={`${styles.small} ${styles.muted}`}>{t('invoiceEditor.noLines')}</p>
					) : (
						<ul className={lines.list}>
							{invoice.lines.map((line) => {
								const open = expanded.has(line.id);
								const editingDesc = descEdit?.lineId === line.id;

								if (editingLineId === line.id) {
									return (
										<li key={line.id} className={lines.line}>
											<ItemLineForm
												label={t('invoiceEditor.editItem')}
												defaultValues={lineDefaults(line)}
												taxChoices={
													taxChoices.includes(line.taxCategory)
														? taxChoices
														: [line.taxCategory, ...taxChoices]
												}
												submitLabel={t('save')}
												pending={editItem.isPending}
												error={
													editItem.error && <Notice tone="error">{errorText(editItem.error)}</Notice>
												}
												onSubmit={(input) => editItem.mutate({ lineId: line.id, input })}
												onCancel={() => {
													setEditingLineId(null);
													editItem.reset();
												}}
											/>
										</li>
									);
								}

								return (
									<li key={line.id} className={lines.line}>
										<div className={lines.head}>
											{editingDesc ? (
												<form
													className={css.textForm}
													aria-label={t('invoiceEditor.editLabel', { description: line.description })}
													onSubmit={(e) => {
														e.preventDefault();
														editText.mutate({ lineId: line.id, description: descEdit.value });
													}}
												>
													<TextAreaField
														label={t('invoiceEditor.itemDescription')}
														rows={2}
														maxLength={1000}
														autoFocus
														value={descEdit.value}
														onChange={(value) => setDescEdit({ lineId: line.id, value })}
													/>
													{editText.error && (
														<Notice tone="error">{errorText(editText.error)}</Notice>
													)}
													<div className={styles.actions}>
														<Button type="submit" variant="primary" isPending={editText.isPending}>
															{t('save')}
														</Button>
														<Button
															variant="quiet"
															onPress={() => {
																setDescEdit(null);
																editText.reset();
															}}
														>
															{t('cancel')}
														</Button>
													</div>
												</form>
											) : (
												<span className={lines.desc}>{line.description}</span>
											)}
											<span className={`${lines.amount} ${styles.mono}`}>
												{formatCents(line.netCents, lng)}
											</span>
										</div>

										{!editingDesc && (
											<LineMeta
												line={line}
												open={open}
												onToggle={() => setExpanded(flip(expanded, line.id))}
											>
												<Button
													variant="quiet"
													aria-label={t('invoiceEditor.editLabel', { description: line.description })}
													onPress={() =>
														line.kind === 'time'
															? setDescEdit({ lineId: line.id, value: line.description })
															: setEditingLineId(line.id)
													}
												>
													{t('edit')}
												</Button>
												{line.kind === 'item' && (
													<Button
														variant="quiet"
														aria-label={t('invoiceEditor.removeLabel', { description: line.description })}
														onPress={() => setRemovingLine(line)}
													>
														{t('invoiceEditor.removeItem')}
													</Button>
												)}
											</LineMeta>
										)}

										{line.kind === 'time' && open && <LineDerivation line={line} />}
									</li>
								);
							})}
						</ul>
					)}

					{addingLine ? (
						<ItemLineForm
							label={t('invoiceEditor.addItem')}
							defaultValues={{
								description: '',
								quantityMilli: '1',
								unit: 'C62',
								unitPriceCents: '',
								taxCategory: taxChoices[0]!
							}}
							taxChoices={taxChoices}
							submitLabel={t('invoiceEditor.addItem')}
							pending={addItem.isPending}
							error={addItem.error && <Notice tone="error">{errorText(addItem.error)}</Notice>}
							onSubmit={(input) => addItem.mutate(input)}
							onCancel={() => {
								setAddingLine(false);
								addItem.reset();
							}}
						/>
					) : (
						<div>
							<Button variant="secondary" onPress={() => setAddingLine(true)}>
								{t('invoiceEditor.addItem')}
							</Button>
						</div>
					)}

					{invoice.hints.map((hint) => (
						<Notice key={hint} tone="info">
							{t(`invoiceEditor.hints.${hint}`, hint)}
						</Notice>
					))}

					{invoice.blockers.length > 0 && (
						<Notice tone="warning">
							<ul id="invoice-blockers" className={css.blockers}>
								{invoice.blockers.map((blocker) => (
									<li key={blocker}>
										{t(`invoiceEditor.blockers.${blocker}`, blocker)}{' '}
										{hasRole(role, 'admin') && <Link to="/billing/settings">{t('nav.settings')}</Link>}
									</li>
								))}
							</ul>
						</Notice>
					)}

					<div className={styles.actions}>
						<Button
							variant="primary"
							isDisabled={invoice.blockers.length > 0 || invoice.lines.length === 0}
							onPress={() => setIssuing(true)}
							{...(invoice.blockers.length > 0 ? { 'aria-describedby': 'invoice-blockers' } : {})}
						>
							{t('invoiceEditor.issue')}
						</Button>
						<Button variant="quiet" onPress={() => setDiscarding(true)}>
							{t('invoiceEditor.discard')}
						</Button>
					</div>
				</section>

				<section className={lines.previewPane} aria-label={t('preview.frameTitle')}>
					<InvoicePreview invoiceId={invoice.id} variant="draft" refreshKey={previewKey} />
				</section>
			</div>

			<IssueDialog invoice={invoice} isOpen={issuing} onClose={() => setIssuing(false)} />

			<ConfirmDialog
				isOpen={discarding}
				onClose={() => {
					setDiscarding(false);
					discard.reset();
				}}
				title={t('invoiceEditor.discardTitle')}
				confirmLabel={t('invoiceEditor.discard')}
				onConfirm={() => discard.mutate()}
				isPending={discard.isPending}
				error={discard.error && <Notice tone="error">{errorText(discard.error)}</Notice>}
			>
				<p>{t('invoiceEditor.discardText')}</p>
			</ConfirmDialog>

			<ConfirmDialog
				isOpen={removingLine !== null}
				onClose={() => {
					setRemovingLine(null);
					removeItem.reset();
				}}
				title={t('invoiceEditor.removeItemTitle')}
				confirmLabel={t('invoiceEditor.removeItem')}
				onConfirm={() => removingLine && removeItem.mutate(removingLine.id)}
				isPending={removeItem.isPending}
				error={removeItem.error && <Notice tone="error">{errorText(removeItem.error)}</Notice>}
			>
				<p>{removingLine && t('invoiceEditor.removeItemText', { description: removingLine.description })}</p>
			</ConfirmDialog>
		</>
	);
}
