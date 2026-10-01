import type { WorkspaceKind } from '@zeit/shared';
import { useSyncExternalStore } from 'react';

const companySteps = ['request', 'approve', 'restFinding', 'close'] as const;
export const tourSteps = [...companySteps, 'invoice'] as const;
export type TourStep = (typeof tourSteps)[number];

export const stepsIn: Record<WorkspaceKind, readonly TourStep[]> = {
	company: companySteps,
	solo: tourSteps
};

// other features tick a step with markTourStep, or by setting zeit.demo.<step> to '1' themselves
const stepKey = (step: TourStep) => `zeit.demo.${step}`;
const foldKey = 'zeit.demo.tour';
const listeners = new Set<() => void>();

function read(key: string) {
	try {
		return sessionStorage.getItem(key);
	} catch {
		return null;
	}
}

function store(key: string, value: string | null) {
	try {
		if (value === null) sessionStorage.removeItem(key);
		else sessionStorage.setItem(key, value);
	} catch {
		// storage switched off, the tour then starts over after a reload
	}
}

export function markTourStep(step: TourStep) {
	store(stepKey(step), '1');
	for (const listener of listeners) listener();
}

// a new sandbox in the same tab must not inherit the ticks of the last one
export function resetTour() {
	for (const step of tourSteps) store(stepKey(step), null);
	store(foldKey, null);
}

export const isTourOpen = () => read(foldKey) !== 'closed';
export const keepTourOpen = (open: boolean) => store(foldKey, open ? null : 'closed');

const subscribe = (listener: () => void) => {
	listeners.add(listener);
	return () => {
		listeners.delete(listener);
	};
};

const marks = () => tourSteps.filter((step) => read(stepKey(step)) === '1').join(',');

export const useTourMarks = () => useSyncExternalStore(subscribe, marks).split(',');
