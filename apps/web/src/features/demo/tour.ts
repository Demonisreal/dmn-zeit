import type { WorkspaceKind } from '@zeit/shared';
import { useSyncExternalStore } from 'react';

const companySteps = ['request', 'approve', 'restFinding', 'close'] as const;
export const tourSteps = [...companySteps, 'invoice'] as const;
export type TourStep = (typeof tourSteps)[number];

export const stepsIn: Record<WorkspaceKind, readonly TourStep[]> = {
	company: companySteps,
	solo: ['invoice']
};

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
		return;
	}
}

export function markTourStep(step: TourStep) {
	store(stepKey(step), '1');
	for (const listener of listeners) listener();
}

export function resetTour() {
	for (const step of tourSteps) store(stepKey(step), null);
	store(foldKey, null);
}

export function isTourOpen() {
	const kept = read(foldKey);
	return kept === null ? !window.matchMedia('(max-width: 37.5rem)').matches : kept === 'open';
}

export const keepTourOpen = (open: boolean) => store(foldKey, open ? 'open' : 'closed');

const subscribe = (listener: () => void) => {
	listeners.add(listener);
	return () => {
		listeners.delete(listener);
	};
};

const marks = () => tourSteps.filter((step) => read(stepKey(step)) === '1').join(',');

export const useTourMarks = () => useSyncExternalStore(subscribe, marks).split(',');
