import type { InvoiceLine } from '@zeit/shared';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Chevron } from '../../components/ui/chevron';
import {
	formatCents,
	formatInstant,
	formatMinutes,
	formatQuantity,
	formatTaxRate,
	formatTime
} from '../../i18n/format';
import { useExplain } from '../projects/explain';
import detail from '../week/day-detail.module.css';
import css from './invoice-lines.module.css';

type MetaProps = {
	line: InvoiceLine;
	open: boolean;
	onToggle: () => void;
	children?: ReactNode;
};

const derivationId = (lineId: string) => `invoice-line-derivation-${lineId}`;

export function LineExemption({ line }: { line: InvoiceLine }) {
	const { t } = useTranslation('billing');
	if (line.exemptionReason === null) return null;
	return (
		<p className={css.reason}>
			{t('invoiceEditor.exemptionReasonLine', { reason: line.exemptionReason })}
		</p>
	);
}

export function LineMeta({ line, open, onToggle, children }: MetaProps) {
	const { t, i18n } = useTranslation('billing');
	const lng = i18n.language;

	return (
		<div className={css.meta}>
			{line.kind === 'time' ? (
				<>
					<span>{formatMinutes(line.minutes ?? 0)}</span>
					<span>{formatTaxRate(line.taxRateBp, lng)}</span>
					<button
						type="button"
						className={css.toggle}
						aria-expanded={open}
						aria-controls={open ? derivationId(line.id) : undefined}
						onClick={onToggle}
					>
						<Chevron direction={open ? 'down' : 'right'} />
						{t('invoiceEditor.derivation')}
					</button>
				</>
			) : (
				<>
					<span>
						{formatQuantity(line.quantityMilli ?? '0', lng)}{' '}
						{t(`invoiceEditor.units.${line.unit ?? 'C62'}`)}
					</span>
					<span>{formatCents(line.unitPriceCents ?? '0', lng)}</span>
					<span>
						{t(`invoiceEditor.taxCategories.${line.taxCategory}`)} ·{' '}
						{formatTaxRate(line.taxRateBp, lng)}
					</span>
				</>
			)}
			{children}
		</div>
	);
}

export function LineDerivation({ line }: { line: InvoiceLine }) {
	const { t, i18n } = useTranslation(['projects', 'week']);
	const lng = i18n.language;
	const explain = useExplain();
	const { entries, rounding, rate } = line.derivation;

	return (
		<div id={derivationId(line.id)} className={detail.detail}>
			<section className={detail.block}>
				<h3>{t('detail.entries')}</h3>
				<ol className={detail.timeline}>
					{entries.map((entry) => (
						<li key={entry.id}>
							<span className={detail.mono}>
								{formatInstant(entry.startedAt, lng)}
								{entry.endedAt ? ` – ${formatTime(entry.endedAt, lng)}` : ''}
							</span>
						</li>
					))}
				</ol>
			</section>
			<section className={detail.block}>
				<h3>{t('week:detail.calc')}</h3>
				<dl className={detail.calc}>
					{rounding && (
						<div>
							<dt>{t('detail.rounded')}</dt>
							<dd>
								<span className={detail.hint}>{explain(rounding)}</span>
							</dd>
						</div>
					)}
					{rate && (
						<div>
							<dt>{t('detail.rate')}</dt>
							<dd>
								<span className={detail.amount}>{formatCents(rate.cents, lng)}</span>
								<span className={detail.hint}>{explain(rate.explanation)}</span>
							</dd>
						</div>
					)}
				</dl>
			</section>
		</div>
	);
}
