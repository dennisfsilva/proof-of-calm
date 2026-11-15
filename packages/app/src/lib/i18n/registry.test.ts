import { describe, expect, it, vi } from 'vitest';
import plan from '../../messages/en/plan.json';
import today from '../../messages/en/today.json';
import { createMessageRegistry } from './registry';

describe('createMessageRegistry', () => {
  it('starts empty and returns the same snapshot until something is added', () => {
    const registry = createMessageRegistry();
    expect(registry.getSnapshot()).toEqual({});
    expect(registry.getSnapshot()).toBe(registry.getSnapshot());
  });

  it('adds a namespace as a new snapshot and tells its subscribers', () => {
    const registry = createMessageRegistry();
    const listener = vi.fn();
    const unsubscribe = registry.subscribe(listener);
    const before = registry.getSnapshot();
    registry.add('plan', plan);
    expect(listener).toHaveBeenCalledTimes(1);
    expect(registry.getSnapshot()).not.toBe(before);
    expect(registry.getSnapshot()).toEqual({ plan });
    unsubscribe();
    registry.add('today', today);
    expect(listener).toHaveBeenCalledTimes(1);
    expect(Object.keys(registry.getSnapshot())).toEqual(['plan', 'today']);
  });

  it('holds the UI language the lazy loaders read, English until the entry sets it', () => {
    const registry = createMessageRegistry();
    expect(registry.language()).toBe('en');
    registry.setLanguage('pt-PT');
    expect(registry.language()).toBe('pt-PT');
  });

  it('keeps the snapshot when the same messages are added again', () => {
    const registry = createMessageRegistry();
    const listener = vi.fn();
    registry.subscribe(listener);
    registry.add('plan', plan);
    const snapshot = registry.getSnapshot();
    registry.add('plan', plan);
    expect(registry.getSnapshot()).toBe(snapshot);
    expect(listener).toHaveBeenCalledTimes(1);
  });
});
