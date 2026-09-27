import { useState, useCallback } from 'react';
import State from '../core/state.js';

export default function useGoals() {
  const [goals, setGoalsState] = useState(() => State.data('goals', []));
  const [mood, setMoodState] = useState(() => State.data('mood', {}));

  const addGoal = useCallback(({ title, area, desc, deadline, milestones }) => {
    const goal = {
      id: `${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      title, area, desc: desc || '', deadline: deadline || null,
      milestones: (milestones || []).map(m => ({ text: m, done: false })),
      createdAt: Date.now(),
    };
    const next = [...goals, goal];
    setGoalsState(next);
    State.setData('goals', next);
    return goal;
  }, [goals]);

  const toggleMilestone = useCallback((goalId, idx) => {
    const next = goals.map(g => g.id === goalId
      ? { ...g, milestones: g.milestones.map((m, i) => i === idx ? { ...m, done: !m.done } : m) }
      : g);
    setGoalsState(next);
    State.setData('goals', next);
  }, [goals]);

  const deleteGoal = useCallback((goalId) => {
    const next = goals.filter(g => g.id !== goalId);
    setGoalsState(next);
    State.setData('goals', next);
  }, [goals]);

  const setTodayMood = useCallback((dateKey, value) => {
    const next = { ...mood, [dateKey]: value };
    setMoodState(next);
    State.setData('mood', next);
  }, [mood]);

  return { goals, addGoal, toggleMilestone, deleteGoal, mood, setTodayMood };
}
