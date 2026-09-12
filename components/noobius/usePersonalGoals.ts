'use client';
import { useEffect, useState } from 'react';
import {
  readPersonalGoal,
  startPersonalGoal,
  type PersonalGoal,
  type ShiftGoalId,
} from '@/lib/personal-goals';
import type { Facility } from '@/lib/facility';

// An optional, local journal. It never changes account balances or game rewards.
export function usePersonalGoals(
  identity: string | undefined,
  facility: Facility,
) {
  const key = identity
    ? `noobius-shift-goal-v1:${encodeURIComponent(identity)}`
    : '';
  const [state, setState] = useState<{
    key: string;
    goal: PersonalGoal | null;
    sessionOnly: boolean;
  }>({ key: '', goal: null, sessionOnly: false });
  useEffect(() => {
    let goal: PersonalGoal | null = null,
      sessionOnly = false;
    try {
      if (key) goal = readPersonalGoal(localStorage.getItem(key));
    } catch {
      sessionOnly = true;
    }
    setState({ key, goal, sessionOnly });
  }, [key]);
  const ready = !!key && state.key === key;
  const save = (goal: PersonalGoal | null) => {
    if (!ready) return;
    let sessionOnly = false;
    try {
      if (goal) localStorage.setItem(key, JSON.stringify(goal));
      else localStorage.removeItem(key);
    } catch {
      sessionOnly = true;
    }
    setState({ key, goal, sessionOnly });
  };
  return {
    goal: ready ? state.goal : null,
    ready,
    sessionOnly: ready && state.sessionOnly,
    choose: (id: ShiftGoalId) => save(startPersonalGoal(facility, id)),
    clear: () => save(null),
  };
}
export type PersonalGoalsController = ReturnType<typeof usePersonalGoals>;
