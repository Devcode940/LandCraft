/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import Toolbar from './Toolbar';

function renderToolbar() {
  const noop = vi.fn();
  render(
    <Toolbar
      unit="m"
      setUnit={noop}
      snapToGrid
      setSnapToGrid={noop}
      snapToElements
      setSnapToElements={noop}
      highContrast={false}
      setHighContrast={noop}
      canUndo
      canRedo
      onUndo={noop}
      onRedo={noop}
      onClear={noop}
      onLoadSample={noop}
      onExportJson={noop}
      onExportSvg={noop}
      onPrint={noop}
      onRepeatPlacement={noop}
      canRepeat
      onOpenSchedule={noop}
      onOpenAR={noop}
      onOpen3D={noop}
      onOpenEstimator={noop}
      zoom={1}
      setZoom={noop}
    />,
  );
  return { noop };
}

describe('Toolbar', () => {
  it('exposes the three export paths as buttons', () => {
    renderToolbar();
    expect(screen.getByRole('button', { name: /export svg/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /export json/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /print \/ pdf/i })).toBeInTheDocument();
  });

  it('offers repeat placement and the room schedule', () => {
    renderToolbar();
    expect(screen.getByRole('button', { name: /repeat/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /schedule/i })).toBeInTheDocument();
  });

  it('offers both 3D views: orbit preview and AR', () => {
    renderToolbar();
    expect(screen.getByRole('button', { name: /3d view/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /view in ar/i })).toBeInTheDocument();
  });
});
