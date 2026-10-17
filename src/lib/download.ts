/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Trigger a browser download for text content.
 *
 * Centralised because three separate call sites (JSON, SVG, and now the
 * imported-plan round trip) each hand-rolled an `<a download>` and two of them
 * leaked the anchor into the DOM when the click threw.
 */
export function downloadBlob(filename: string, content: string, mime: string): void {
  const url = URL.createObjectURL(new Blob([content], { type: `${mime};charset=utf-8` }));
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  try {
    anchor.click();
  } finally {
    anchor.remove();
    // Revoke on the next frame: Safari cancels the download if the object URL
    // disappears in the same task as the click.
    requestAnimationFrame(() => URL.revokeObjectURL(url));
  }
}
