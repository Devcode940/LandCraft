/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect, it } from 'vitest';
import { EMPTY_SELECTION, isSelected, selectSingle, toggleId } from './selection';

describe('selection model', () => {
  it('selects a single element', () => {
    expect(selectSingle('room', 'r1')).toEqual({ type: 'room', ids: ['r1'] });
  });

  it('adds an element of the same type additively', () => {
    const sel = toggleId(selectSingle('furniture', 'f1'), 'furniture', 'f2');
    expect(sel.ids).toEqual(['f1', 'f2']);
  });

  it('toggles an element off', () => {
    const sel = toggleId(
      toggleId(selectSingle('furniture', 'f1'), 'furniture', 'f2'),
      'furniture',
      'f1',
    );
    expect(sel.ids).toEqual(['f2']);
  });

  it('restarts the selection when the type changes', () => {
    const sel = toggleId(selectSingle('room', 'r1'), 'furniture', 'f1');
    expect(sel).toEqual({ type: 'furniture', ids: ['f1'] });
  });

  it('matches membership only within the same type', () => {
    const sel = selectSingle('room', 'r1');
    expect(isSelected(sel, 'room', 'r1')).toBe(true);
    // Same id string under a different type is not selected.
    expect(isSelected(sel, 'furniture', 'r1')).toBe(false);
    expect(isSelected(EMPTY_SELECTION, 'room', 'r1')).toBe(false);
  });
});
