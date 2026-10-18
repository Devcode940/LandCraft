/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { afterEach, describe, expect, it, vi } from 'vitest';
import { printBlueprint } from './printBlueprint';

function makeSvg(withAttrs: boolean): SVGSVGElement {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  if (withAttrs) {
    svg.setAttribute('width', '500');
    svg.setAttribute('height', '400');
    svg.setAttribute('viewBox', '0 0 500 400');
  }
  document.body.appendChild(svg);
  return svg;
}

afterEach(() => {
  document.body.innerHTML = '';
  vi.restoreAllMocks();
});

describe('printBlueprint', () => {
  it('gives the SVG intrinsic dimensions and a viewBox for the printer', () => {
    const print = vi.spyOn(window, 'print').mockImplementation(() => {});
    const svg = makeSvg(false);

    printBlueprint(svg);

    expect(print).toHaveBeenCalled();
    // jsdom reports a zero rect, so the floor of 1px applies.
    expect(svg.getAttribute('width')).toBe('1');
    expect(svg.getAttribute('height')).toBe('1');
    expect(svg.getAttribute('viewBox')).toBe('0 0 1 1');
  });

  it('restores the previous attributes after printing', () => {
    vi.spyOn(window, 'print').mockImplementation(() => {});
    const svg = makeSvg(true);

    printBlueprint(svg);
    window.dispatchEvent(new Event('afterprint'));

    expect(svg.getAttribute('width')).toBe('500');
    expect(svg.getAttribute('height')).toBe('400');
    expect(svg.getAttribute('viewBox')).toBe('0 0 500 400');
  });

  it('removes attributes it added when there were none before', () => {
    vi.spyOn(window, 'print').mockImplementation(() => {});
    const svg = makeSvg(false);

    printBlueprint(svg);
    window.dispatchEvent(new Event('afterprint'));

    expect(svg.hasAttribute('width')).toBe(false);
    expect(svg.hasAttribute('height')).toBe(false);
    expect(svg.hasAttribute('viewBox')).toBe(false);
  });

  it('stops listening after the first afterprint', () => {
    vi.spyOn(window, 'print').mockImplementation(() => {});
    const svg = makeSvg(true);

    printBlueprint(svg);
    window.dispatchEvent(new Event('afterprint'));
    // A second print cycle must not restore stale values.
    svg.setAttribute('width', '999');
    window.dispatchEvent(new Event('afterprint'));

    expect(svg.getAttribute('width')).toBe('999');
  });
});
