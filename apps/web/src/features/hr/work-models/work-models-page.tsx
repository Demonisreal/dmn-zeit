import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { WorkModel } from '@zeit/shared';
import { useState } from 'react';
import { VisuallyHidden } from 'react-aria-components';
import { useTranslation } from 'react-i18next';
import { Button } from '../../../components/ui/button';
import { EmptyState } from '../../../components/ui/empty-state';
import { Notice } from '../../../components/ui/notice';
import { Table } from '../../../components/ui/table';
import { Tag } from '../../../components/ui/tag';
import { formatMinutes } from '../../../i18n/format';
import { updateWorkModel, workModelsQuery } from '../api';
import { useErrorText } from '../error-text';
import { HrNav } from '../hr-nav';
import { Checkbox } from '../ui/checkbox';
import { Loading, LoadError } from '../ui/states';
import styles from '../ui/page.module.css';
import { WeekdayMinutes, weekMinutes } from '../weekday-minutes';
import { WorkModelForm } from './work-model-form';

// undefined: no form, null: a new model
type Editing = WorkModel | null | undefined;

export function WorkModelsPage() {
	const { t, i18n } = useTranslation('hr');
	const errorText = useErrorText();
	const queryClient = useQueryClient();
	const [includeArchived, setIncludeArchived] = useState(false);
	const [editing, setEditing] = useState<Editing>();
	const models = useQuery(workModelsQuery(includeArchived));

	const archive = useMutation({
		mutationFn: (model: WorkModel) =>
			updateWorkModel(model.id, { archived: model.archivedAt === null }),
		onSuccess: () => queryClient.invalidateQueries({ queryKey: ['work-models'] })
	});

	let list;
	if (models.isError) {
		list = <LoadError error={models.error} onRetry={() => void models.refetch()} />;
	} else if (!models.data) {
		list = <Loading />;
	} else if (models.data.length === 0) {
		list = <EmptyState title={t('workModels.empty')}>{t('workModels.emptyHint')}</EmptyState>;
	} else {
		list = (
			<div className={styles.scroll}>
				<Table label={t('workModels.title')}>
					<thead>
						<tr>
							<th scope="col">{t('workModels.name')}</th>
							<th scope="col" data-numeric>
								{t('workModels.weekTarget')}
							</th>
							<th scope="col">{t('contracts.days')}</th>
							<th scope="col">
								<VisuallyHidden>{t('actions')}</VisuallyHidden>
							</th>
						</tr>
					</thead>
					<tbody>
						{models.data
							.toSorted((a, b) => a.name.localeCompare(b.name, i18n.language))
							.map((model) => (
								<tr key={model.id}>
									<td>
										{model.name} {model.archivedAt && <Tag>{t('workModels.archived')}</Tag>}
									</td>
									<td data-numeric>{formatMinutes(weekMinutes(model.minutes))}</td>
									<td>
										<WeekdayMinutes minutes={model.minutes} />
									</td>
									<td>
										<div className={styles.rowActions}>
											{model.archivedAt === null && (
												<Button variant="quiet" onPress={() => setEditing(model)}>
													{t('edit')}
												</Button>
											)}
											<Button
												variant="quiet"
												isPending={archive.isPending && archive.variables === model}
												onPress={() => archive.mutate(model)}
											>
												{model.archivedAt ? t('workModels.restore') : t('workModels.archive')}
											</Button>
										</div>
									</td>
								</tr>
							))}
					</tbody>
				</Table>
			</div>
		);
	}

	return (
		<>
			<HrNav />
			<div className={styles.page}>
				<header className={styles.head}>
					<div>
						<h1>{t('workModels.title')}</h1>
						<p className={styles.lead}>{t('workModels.lead')}</p>
					</div>
					{editing === undefined && (
						<Button variant="primary" onPress={() => setEditing(null)}>
							{t('workModels.new')}
						</Button>
					)}
				</header>

				{editing !== undefined && (
					<WorkModelForm
						key={editing?.id ?? 'new'}
						model={editing ?? undefined}
						onDone={() => setEditing(undefined)}
					/>
				)}

				<section className={styles.section} aria-label={t('workModels.title')}>
					<div className={styles.filters}>
						<Checkbox isSelected={includeArchived} onChange={setIncludeArchived}>
							{t('workModels.includeArchived')}
						</Checkbox>
					</div>
					{archive.error && <Notice tone="error">{errorText(archive.error)}</Notice>}
					{list}
				</section>
			</div>
		</>
	);
}
