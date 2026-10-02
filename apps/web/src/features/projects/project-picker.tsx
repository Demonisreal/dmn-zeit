import type { BookableProject } from '@zeit/shared';
import {
	Button,
	ComboBox,
	FieldError,
	Header,
	Input,
	Label,
	ListBox,
	ListBoxItem,
	ListBoxSection,
	Popover
} from 'react-aria-components';
import { useTranslation } from 'react-i18next';
import field from '../../components/ui/field.module.css';
import select from '../../components/ui/select-field.module.css';
import css from './project-picker.module.css';

const fieldStyles = field as Record<'field' | 'label' | 'input' | 'error', string>;
const selectStyles = select as Record<'caret' | 'popover' | 'list' | 'option', string>;
const styles = css as Record<
	'picker' | 'hidden' | 'control' | 'input' | 'button' | 'client' | 'task' | 'none',
	string
>;

export type Slot = { projectId: string; taskId: string | null };

export const slotKey = ({ projectId, taskId }: Slot) =>
	taskId ? `${projectId}/${taskId}` : projectId;

export function slotOf(key: string): Slot {
	const [projectId = '', taskId] = key.split('/');
	return { projectId, taskId: taskId ?? null };
}

export function describeSlot(projects: BookableProject[] | undefined, slot: Slot) {
	const project = projects?.find((candidate) => candidate.id === slot.projectId);
	if (!project) return null;
	const task = project.tasks.find((candidate) => candidate.id === slot.taskId);
	return { client: project.clientName, project: project.name, task: task?.name ?? null };
}

function byClient(projects: BookableProject[]) {
	const clients = new Map<string, BookableProject[]>();
	for (const project of projects) {
		clients.set(project.clientName, [...(clients.get(project.clientName) ?? []), project]);
	}
	return [...clients];
}

type Props = {
	label: string;
	projects: BookableProject[];
	value: string;
	onChange: (key: string) => void;
	onBlur?: () => void;
	error?: string | undefined;
	hideLabel?: boolean;
	isDisabled?: boolean;
};

export function ProjectPicker({
	label,
	projects,
	value,
	onChange,
	onBlur,
	error,
	hideLabel = false,
	isDisabled = false
}: Props) {
	const { t } = useTranslation('projects');
	return (
		<ComboBox
			value={value || null}
			onChange={(key) => onChange(key === null ? '' : String(key))}
			onBlur={() => onBlur?.()}
			menuTrigger="focus"
			allowsEmptyCollection
			isDisabled={isDisabled}
			isInvalid={error !== undefined}
			validationBehavior="aria"
			className={`${fieldStyles.field} ${styles.picker}`}
		>
			<Label className={hideLabel ? styles.hidden : fieldStyles.label}>{label}</Label>
			<div className={styles.control}>
				<Input
					className={`${fieldStyles.input} ${styles.input}`}
					placeholder={t('picker.placeholder')}
				/>
				<Button className={styles.button}>
					<span className={selectStyles.caret} aria-hidden="true" />
				</Button>
			</div>
			<FieldError className={fieldStyles.error}>{error}</FieldError>
			<Popover className={selectStyles.popover} offset={4}>
				<ListBox
					className={selectStyles.list}
					renderEmptyState={() => <p className={styles.none}>{t('picker.none')}</p>}
				>
					{byClient(projects).map(([client, group]) => (
						<ListBoxSection key={client} id={client}>
							<Header className={styles.client}>{client}</Header>
							{group.flatMap((project) => [
								<ListBoxItem
									key={project.id}
									id={project.id}
									textValue={project.name}
									className={selectStyles.option}
								>
									{project.name}
								</ListBoxItem>,
								...project.tasks.map((task) => (
									<ListBoxItem
										key={task.id}
										id={slotKey({ projectId: project.id, taskId: task.id })}
										textValue={`${project.name} · ${task.name}`}
										className={`${selectStyles.option} ${styles.task}`}
									>
										{task.name}
									</ListBoxItem>
								))
							])}
						</ListBoxSection>
					))}
				</ListBox>
			</Popover>
		</ComboBox>
	);
}
