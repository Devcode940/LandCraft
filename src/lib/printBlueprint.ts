/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Print the live blueprint SVG.
 *
 * The canvas SVG is sized by CSS (w-full/h-full) and carries the
 * current pan/zoom transform on an inner <g>, so printing it as-is
 * clips at CSS pixels. For the printer it is given intrinsic
 * dimensions and a matching viewBox, which makes the browser scale
 * the current view to the page. The attributes are restored on
 * afterprint so the interactive canvas is untouched afterwards.
 *
 * React never owns width/height/viewBox on this element, so the
 * direct mutations cannot be overwritten by a re-render.
 */

export function printBlueprint(svgElement: SVGSVGElement): void {
  const rect = svgElement.getBoundingClientRect();
  const width = Math.max(1, Math.round(rect.width));
  const height = Math.max(1, Math.round(rect.height));

  const previous = {
    width: svgElement.getAttribute('width'),
    height: svgElement.getAttribute('height'),
    viewBox: svgElement.getAttribute('viewBox'),
  };

  svgElement.setAttribute('width', String(width));
  svgElement.setAttribute('height', String(height));
  svgElement.setAttribute('viewBox', `0 0 ${width} ${height}`);

  const restore = () => {
    for (const [attr, value] of Object.entries(previous)) {
      if (value === null) svgElement.removeAttribute(attr);
      else svgElement.setAttribute(attr, value);
    }
    window.removeEventListener('afterprint', restore);
  };

  window.addEventListener('afterprint', restore);
  window.print();
}
