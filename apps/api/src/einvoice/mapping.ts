import type { Invoice } from '@e-invoice-eu/core';
import type { TaxCategory } from '@zeit/rules';
import { leitwegIdValid } from '@zeit/shared';
import type { EInvoice, EInvoiceBuyer, EInvoiceLine } from './einvoice';
import { TEXTS } from './texts';

type Ubl = Invoice['ubl:Invoice'];
type UblLine = Ubl['cac:InvoiceLine'][number];
type SellerParty = Ubl['cac:AccountingSupplierParty']['cac:Party'];
type BuyerParty = Ubl['cac:AccountingCustomerParty']['cac:Party'];
type Country = BuyerParty['cac:PostalAddress']['cac:Country']['cbc:IdentificationCode'];
type VatCategory = UblLine['cac:Item']['cac:ClassifiedTaxCategory'];
type Subtotal = NonNullable<Ubl['cac:TaxTotal'][0]['cac:TaxSubtotal']>[number];

const EUR = 'EUR';
const VAT = { 'cbc:ID': 'VAT' };

const VAT_CODES: Record<TaxCategory, VatCategory['cbc:ID']> = {
	standard: 'S',
	reduced: 'S',
	exempt: 'E',
	small_business: 'E',
	reverse_charge: 'AE',
	outside_scope: 'O'
};

export const isLeitwegId = (buyer: Pick<EInvoiceBuyer, 'buyerReference'>) =>
	buyer.buyerReference !== null && leitwegIdValid(buyer.buyerReference);

export const buyerEndpoint = (buyer: Pick<EInvoiceBuyer, 'buyerReference' | 'email'>) => {
	if (isLeitwegId(buyer)) {
		return { id: buyer.buyerReference!, scheme: '0204' as const };
	}
	return buyer.email ? { id: buyer.email, scheme: 'EM' as const } : null;
};

const decimal = (value: bigint, places: number) => {
	const digits = String(value < 0n ? -value : value).padStart(places + 1, '0');
	return `${value < 0n ? '-' : ''}${digits.slice(0, -places)}.${digits.slice(-places)}`;
};

const money = (cents: bigint) => decimal(cents, 2);

function lineVatCategory(category: TaxCategory, rateBp: number): VatCategory {
	return category === 'outside_scope'
		? { 'cbc:ID': 'O', 'cac:TaxScheme': VAT }
		: {
				'cbc:ID': VAT_CODES[category],
				'cbc:Percent': decimal(BigInt(rateBp), 2),
				'cac:TaxScheme': VAT
			};
}

function exemption(category: TaxCategory, invoice: EInvoice) {
	const texts = TEXTS[invoice.locale];
	switch (category) {
		case 'reverse_charge':
			return {
				'cbc:TaxExemptionReasonCode': 'VATEX-EU-AE' as const,
				'cbc:TaxExemptionReason': texts.reverseCharge
			};
		case 'outside_scope':
			return {
				'cbc:TaxExemptionReasonCode': 'VATEX-EU-O' as const,
				'cbc:TaxExemptionReason': texts.outsideScope
			};
		case 'small_business':
			return { 'cbc:TaxExemptionReason': texts.smallBusiness };
		case 'exempt':
			return { 'cbc:TaxExemptionReason': invoice.exemptionReason ?? '' };
		default:
			return {};
	}
}

function notes(invoice: EInvoice): string[] {
	const texts = TEXTS[invoice.locale];
	const notes: string[] = [];
	if (invoice.specimen) {
		notes.push(texts.specimen);
	}
	if (invoice.kind === 'cancellation') {
		notes.push(texts.cancels(invoice.cancels.number, texts.date(invoice.cancels.issueDate)));
	}
	const legal = {
		regular: null,
		reverse_charge: texts.reverseCharge,
		small_business: texts.smallBusiness,
		outside_scope: texts.outsideScope
	}[invoice.treatment];
	if (legal) {
		notes.push(legal);
	}
	return notes;
}

function invoiceLine(line: EInvoiceLine, index: number, sign: bigint): UblLine {
	const { quantity } = line;
	const [milli, unit] =
		'minutes' in quantity
			? [BigInt(quantity.minutes) * 1000n, 'MIN' as const]
			: [quantity.milli, quantity.unit];
	const direction = line.unitPriceCents < 0n ? -sign : sign;
	const [name = '', ...rest] = line.description.trim().split('\n');
	return {
		'cbc:ID': String(index + 1),
		'cbc:InvoicedQuantity': decimal(milli * direction, 3),
		'cbc:InvoicedQuantity@unitCode': unit,
		'cbc:LineExtensionAmount': money(line.netCents * sign),
		'cbc:LineExtensionAmount@currencyID': EUR,
		...(line.serviceFrom !== null &&
			line.serviceTo !== null && {
				'cac:InvoicePeriod': {
					'cbc:StartDate': line.serviceFrom.toString(),
					'cbc:EndDate': line.serviceTo.toString()
				}
			}),
		'cac:Item': {
			...(rest.length > 0 && { 'cbc:Description': line.description }),
			'cbc:Name': name,
			'cac:ClassifiedTaxCategory': lineVatCategory(line.taxCategory, line.taxRateBp)
		},
		'cac:Price': {
			'cbc:PriceAmount': money(
				line.unitPriceCents < 0n ? -line.unitPriceCents : line.unitPriceCents
			),
			'cbc:PriceAmount@currencyID': EUR,
			...(unit === 'MIN' && {
				'cbc:BaseQuantity': '60',
				'cbc:BaseQuantity@unitCode': 'MIN' as const
			})
		}
	};
}

function sellerParty(invoice: EInvoice): SellerParty {
	const { seller } = invoice;
	const vatId = invoice.treatment === 'outside_scope' ? null : seller.vatId;
	const taxIds = [
		...(vatId !== null ? [{ 'cbc:CompanyID': vatId, 'cac:TaxScheme': VAT }] : []),
		...(seller.taxNumber !== null
			? [{ 'cbc:CompanyID': seller.taxNumber, 'cac:TaxScheme': { 'cbc:ID': 'FC' } }]
			: [])
	] as NonNullable<SellerParty['cac:PartyTaxScheme']>;
	return {
		...(seller.contactEmail !== null && {
			'cbc:EndpointID': seller.contactEmail,
			'cbc:EndpointID@schemeID': 'EM' as const
		}),
		...(vatId === null &&
			seller.taxNumber !== null && {
				'cac:PartyIdentification': [{ 'cbc:ID': seller.taxNumber }]
			}),
		'cac:PostalAddress': {
			...(seller.street !== null && { 'cbc:StreetName': seller.street }),
			...(seller.city !== null && { 'cbc:CityName': seller.city }),
			...(seller.postalCode !== null && { 'cbc:PostalZone': seller.postalCode }),
			'cac:Country': { 'cbc:IdentificationCode': seller.countryCode }
		},
		'cac:PartyTaxScheme': taxIds,
		'cac:PartyLegalEntity': {
			'cbc:RegistrationName': seller.legalName,
			...(seller.registerNumber !== null && { 'cbc:CompanyID': seller.registerNumber }),
			...(seller.registerCourt !== null && { 'cbc:CompanyLegalForm': seller.registerCourt })
		},
		'cac:Contact': {
			...(seller.contactName !== null && { 'cbc:Name': seller.contactName }),
			...(seller.contactPhone !== null && { 'cbc:Telephone': seller.contactPhone }),
			...(seller.contactEmail !== null && { 'cbc:ElectronicMail': seller.contactEmail })
		}
	};
}

function buyerParty(invoice: EInvoice): BuyerParty {
	const { buyer } = invoice;
	const endpoint = buyerEndpoint(buyer);
	return {
		...(endpoint !== null && {
			'cbc:EndpointID': endpoint.id,
			'cbc:EndpointID@schemeID': endpoint.scheme
		}),
		'cac:PostalAddress': {
			...(buyer.street !== null && { 'cbc:StreetName': buyer.street }),
			...(buyer.city !== null && { 'cbc:CityName': buyer.city }),
			...(buyer.postalCode !== null && { 'cbc:PostalZone': buyer.postalCode }),
			'cac:Country': { 'cbc:IdentificationCode': buyer.countryCode as Country }
		},
		...(buyer.vatId !== null &&
			invoice.treatment !== 'outside_scope' && {
				'cac:PartyTaxScheme': { 'cbc:CompanyID': buyer.vatId, 'cac:TaxScheme': VAT }
			}),
		'cac:PartyLegalEntity': { 'cbc:RegistrationName': buyer.name }
	};
}

function paymentMeans(invoice: EInvoice): Pick<Ubl, 'cac:PaymentMeans'> {
	const { seller } = invoice;
	if (invoice.kind === 'cancellation') {
		return { 'cac:PaymentMeans': [{ 'cbc:PaymentMeansCode': '97' }] };
	}
	if (seller.iban === null) {
		return {};
	}
	return {
		'cac:PaymentMeans': [
			{
				'cbc:PaymentMeansCode': '58',
				'cbc:PaymentID': invoice.number,
				'cac:PayeeFinancialAccount': {
					'cbc:ID': seller.iban,
					'cbc:Name': seller.legalName,
					...(seller.bic !== null && {
						'cac:FinancialInstitutionBranch': { 'cbc:ID': seller.bic }
					})
				}
			}
		]
	};
}

export function toUbl(invoice: EInvoice): Invoice {
	const texts = TEXTS[invoice.locale];
	const { totals, buyer } = invoice;
	const sign = invoice.kind === 'cancellation' ? -1n : 1n;
	const notesText = notes(invoice);
	const subtotals = totals.groups.map((group): Subtotal => ({
		'cbc:TaxableAmount': money(group.netCents * sign),
		'cbc:TaxableAmount@currencyID': EUR,
		'cbc:TaxAmount': money(group.taxCents * sign),
		'cbc:TaxAmount@currencyID': EUR,
		'cac:TaxCategory': {
			'cbc:ID': VAT_CODES[group.taxCategory],
			'cbc:Percent': decimal(BigInt(group.taxRateBp), 2),
			...exemption(group.taxCategory, invoice),
			'cac:TaxScheme': VAT
		}
	}));
	const lines = invoice.lines.map((line, index) => invoiceLine(line, index, sign));

	return {
		'ubl:Invoice': {
			'cbc:ID': invoice.number,
			'cbc:IssueDate': invoice.issueDate.toString(),
			'cbc:DueDate': invoice.dueDate.toString(),
			'cbc:InvoiceTypeCode': invoice.kind === 'cancellation' ? '381' : '380',
			...(notesText.length > 0 && { 'cbc:Note': [notesText.join('\n')] }),
			'cbc:DocumentCurrencyCode': EUR,
			...(buyer.buyerReference !== null && { 'cbc:BuyerReference': buyer.buyerReference }),
			'cac:InvoicePeriod': {
				'cbc:StartDate': invoice.serviceFrom.toString(),
				'cbc:EndDate': invoice.serviceTo.toString()
			},
			...(invoice.kind === 'cancellation' && {
				'cac:BillingReference': [
					{
						'cac:InvoiceDocumentReference': {
							'cbc:ID': invoice.cancels.number,
							'cbc:IssueDate': invoice.cancels.issueDate.toString()
						}
					}
				]
			}),
			'cac:AccountingSupplierParty': { 'cac:Party': sellerParty(invoice) },
			'cac:AccountingCustomerParty': { 'cac:Party': buyerParty(invoice) },
			'cac:Delivery': { 'cbc:ActualDeliveryDate': invoice.serviceTo.toString() },
			...paymentMeans(invoice),
			'cac:PaymentTerms': {
				'cbc:Note':
					invoice.kind === 'cancellation'
						? texts.offsetAgainst(invoice.cancels.number)
						: texts.payableBy(texts.date(invoice.dueDate))
			},
			'cac:TaxTotal': [
				{
					'cbc:TaxAmount': money(totals.taxCents * sign),
					'cbc:TaxAmount@currencyID': EUR,
					'cac:TaxSubtotal': subtotals
				}
			],
			'cac:LegalMonetaryTotal': {
				'cbc:LineExtensionAmount': money(totals.netCents * sign),
				'cbc:LineExtensionAmount@currencyID': EUR,
				'cbc:TaxExclusiveAmount': money(totals.netCents * sign),
				'cbc:TaxExclusiveAmount@currencyID': EUR,
				'cbc:TaxInclusiveAmount': money(totals.grossCents * sign),
				'cbc:TaxInclusiveAmount@currencyID': EUR,
				'cbc:PayableAmount': money(totals.grossCents * sign),
				'cbc:PayableAmount@currencyID': EUR
			},
			'cac:InvoiceLine': lines as [UblLine, ...UblLine[]]
		}
	};
}
