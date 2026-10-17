/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { beforeEach, describe, expect, it } from 'vitest';
import { clearStoredPlan, loadPlanLocally, parsePlanFile, savePlanLocally } from './persistence';
import { emptyPlan } from './planOps';
import type { FloorPlanData } from '../types';

const sample = (): FloorPlanData => ({
  ...emptyPlan(),
  rooms: [{ id: 'r1', x: 0, y: 0, width: 100, height: 100, label: 'Living', color: 'rgba(0,0,0,0.1)' }],
});

describe('local persistence', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('round-trips a plan through localStorage', () => {
    expect(savePlanLocally(sample())).toBe(true);
    const restored = loadPlanLocally();
    expect(restored).not.toBeNull();
    expect(restored!.plan.rooms[0].label).toBe('Living');
    expect(restored!.savedAt).toBeTruthy();
  });

  it('returns null when nothing is stored', () => {
    expect(loadPlanLocally()).toBeNull();
  });

  it('clears stored plans', () => {
    savePlanLocally(sample());
    clearStoredPlan();
    expect(loadPlanLocally()).toBeNull();
  });

  it('survives corrupt JSON in storage', () => {
    localStorage.setItem('landcraft:plan', '{not json');
    expect(loadPlanLocally()).toBeNull();
  });

  it('rejects a stored payload with no plan', () => {
    localStorage.setItem('landcraft:plan', JSON.stringify({ version: 1 }));
    expect(loadPlanLocally()).toBeNull();
  });

  it('normalizes a hand-edited stored plan', () => {
    localStorage.setItem(
      'landcraft:plan',
      JSON.stringify({
        version: 1,
        savedAt: '2026-01-01T00:00:00Z',
        plan: { rooms: [{ width: -5, height: 0 }] },
      }),
    );
    const restored = loadPlanLocally();
    expect(restored).not.toBeNull();
    expect(restored!.plan.rooms[0].width).toBeGreaterThanOrEqual(1);
  });

  it('discards an empty stored plan', () => {
    savePlanLocally(emptyPlan());
    expect(loadPlanLocally()).toBeNull();
  });
});

describe('parsePlanFile', () => {
  it('accepts a bare plan object', () => {
    const plan = parsePlanFile(JSON.stringify(sample()));
    expect(plan.rooms).toHaveLength(1);
  });

  it('accepts a wrapped export', () => {
    const plan = parsePlanFile(JSON.stringify({ plan: sample() }));
    expect(plan.rooms).toHaveLength(1);
  });

  it('rejects non-JSON', () => {
    expect(() => parsePlanFile('not json')).toThrow(/not valid JSON/i);
  });

  it('rejects arrays and primitives', () => {
    expect(() => parsePlanFile('[]')).toThrow(/expected a LandCraft plan object/i);
    expect(() => parsePlanFile('42')).toThrow(/expected a LandCraft plan object/i);
  });

  it('rejects a file with no drawable content', () => {
    expect(() =>
      parsePlanFile(JSON.stringify({ walls: [], rooms: [], openings: [], furniture: [] })),
    ).toThrow(/does not contain any/i);
  });

  it('normalizes hostile field values rather than trusting the file', () => {
    const plan = parsePlanFile(JSON.stringify({ rooms: [{ id: 'r', width: -99, height: 'x' }] }));
    expect(plan.rooms[0].width).toBeGreaterThanOrEqual(1);
    expect(Number.isFinite(plan.rooms[0].height)).toBe(true);
  });
});
