/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Local persistence for the working plan.
 *
 * Without this a browser refresh silently discarded everything: the app could
 * export JSON but never read it back, and there was no autosave.
 */

import type { FloorPlanData } from '../types';
import { normalizePlan } from '../utils/normalizePlan';
import { isPlanEmpty } from './planOps';

const STORAGE_KEY = 'landcraft:plan';
const SCHEMA_VERSION = 1;

export interface StoredPlan {
  version: number;
  savedAt: string;
  plan: FloorPlanData;
}

/** localStorage can throw (Safari private mode, disabled storage, quota). */
function safeStorage(): Storage | null {
  try {
    if (typeof window === 'undefined' || !window.localStorage) return null;
    const probe = '__landcraft_probe__';
    window.localStorage.setItem(probe, '1');
    window.localStorage.removeItem(probe);
    return window.localStorage;
  } catch {
    return null;
  }
}

export function savePlanLocally(plan: FloorPlanData): boolean {
  const store = safeStorage();
  if (!store) return false;

  // An empty plan is stored as *absent*, not as an empty document. Otherwise
  // "clear the canvas, reload" restores the starter plan, because
  // loadPlanLocally discards empty plans and the caller then falls back.
  if (isPlanEmpty(plan)) {
    clearStoredPlan();
    return true;
  }

  try {
    const payload: StoredPlan = { version: SCHEMA_VERSION, savedAt: new Date().toISOString(), plan };
    store.setItem(STORAGE_KEY, JSON.stringify(payload));
    return true;
  } catch (err) {
    // QuotaExceededError on a very large plan: drop the autosave rather than
    // breaking the editing session.
    console.warn('[LandCraft] Autosave failed:', err);
    return false;
  }
}

/**
 * Read back a saved plan. Always normalized, so a hand-edited or older payload
 * cannot crash the canvas. Returns null when there is nothing usable.
 */
export function loadPlanLocally(): StoredPlan | null {
  const store = safeStorage();
  if (!store) return null;
  try {
    const raw = store.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<StoredPlan>;
    if (!parsed || typeof parsed !== 'object' || !parsed.plan) return null;

    const plan = normalizePlan(parsed.plan);
    if (isPlanEmpty(plan)) return null;

    return {
      version: typeof parsed.version === 'number' ? parsed.version : SCHEMA_VERSION,
      savedAt: typeof parsed.savedAt === 'string' ? parsed.savedAt : new Date().toISOString(),
      plan,
    };
  } catch (err) {
    console.warn('[LandCraft] Could not read saved plan, ignoring it:', err);
    return null;
  }
}

export function clearStoredPlan(): void {
  const store = safeStorage();
  if (!store) return;
  try {
    store.removeItem(STORAGE_KEY);
  } catch {
    /* nothing useful to do */
  }
}

/** Parse a user-supplied .json export. Throws with a user-facing message. */
export function parsePlanFile(text: string): FloorPlanData {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error('That file is not valid JSON.');
  }

  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    throw new Error('Expected a LandCraft plan object.');
  }

  const record = parsed as Record<string, unknown>;
  // Accept either a bare plan or a full export wrapper.
  const candidate = record.plan ?? record;
  const plan = normalizePlan(candidate);

  if (isPlanEmpty(plan)) {
    throw new Error('That file does not contain any walls, rooms, openings or furniture.');
  }
  return plan;
}
