/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Accessible modal dialog.
 *
 * The panels this replaces were plain `<div className="fixed inset-0">`. That
 * looks like a modal but behaves nothing like one:
 *
 *   - No `role="dialog"` / `aria-modal`, so a screen reader announced the
 *     content as part of the page and never mentioned that focus had moved.
 *   - Tab walked straight out into the toolbar behind the overlay, letting a
 *     keyboard user operate controls they could not see.
 *   - Escape did nothing.
 *   - Closing left focus on `<body>`, so the next Tab started from the top of
 *     the document instead of the button that opened the panel.
 *   - The page behind still scrolled under the overlay on touch devices.
 *
 * All five behaviours are handled here so each panel gets them for free.
 */

import { useCallback, useEffect, useId, useRef, type ReactNode } from 'react';
import { createPortal } from 'react-dom';

const FOCUSABLE = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled]):not([type="hidden"])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(',');

/**
 * Is this element something Tab can actually land on?
 *
 * Deliberately based on computed style rather than `offsetParent`: that
 * property needs a layout engine, so the filter matched nothing outside a real
 * browser (and under test) and silently disabled the entire focus trap.
 * Panels here are conditionally rendered, so hidden ancestors are not a case
 * this has to catch.
 */
function isReachable(el: HTMLElement): boolean {
  if (el.hasAttribute('hidden') || el.getAttribute('aria-hidden') === 'true') return false;
  if (el.tabIndex < 0 && !el.hasAttribute('tabindex')) return false;
  const style = window.getComputedStyle(el);
  return style.display !== 'none' && style.visibility !== 'hidden';
}

export interface ModalProps {
  /** Accessible name, shown or not. */
  label: string;
  onClose: () => void;
  children: ReactNode;
  /** Extra classes for the dialog surface itself. */
  className?: string;
  /** Wrapper classes, e.g. to change padding or alignment. */
  overlayClassName?: string;
  /** When false, Escape and backdrop clicks do not close (e.g. a busy state). */
  dismissible?: boolean;
}

export default function Modal({
  label,
  onClose,
  children,
  className = '',
  overlayClassName = '',
  dismissible = true,
}: ModalProps) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const titleId = useId();
  /** The element that had focus before opening, restored on close. */
  const returnFocusTo = useRef<HTMLElement | null>(null);

  const focusables = useCallback((): HTMLElement[] => {
    const root = dialogRef.current;
    if (!root) return [];
    return Array.from(root.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(isReachable);
  }, []);

  // Capture the opener, move focus in, and restore it afterwards.
  useEffect(() => {
    returnFocusTo.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;

    // Focus the first real control, or the dialog itself if there is none, so
    // the screen reader starts reading inside the dialog.
    const id = window.requestAnimationFrame(() => {
      const first = focusables()[0];
      (first ?? dialogRef.current)?.focus();
    });

    return () => {
      window.cancelAnimationFrame(id);
      returnFocusTo.current?.focus?.({ preventScroll: true });
    };
  }, [focusables]);

  // Lock background scrolling for as long as the dialog is open.
  useEffect(() => {
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previous;
    };
  }, []);

  // Escape closes; Tab cycles within the dialog.
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && dismissible) {
        e.stopPropagation();
        onClose();
        return;
      }

      if (e.key !== 'Tab') return;

      const items = focusables();
      if (items.length === 0) {
        // Nothing focusable: keep focus on the dialog rather than escaping.
        e.preventDefault();
        dialogRef.current?.focus();
        return;
      }

      const first = items[0];
      const last = items[items.length - 1];
      const active = document.activeElement;

      if (e.shiftKey && (active === first || !dialogRef.current?.contains(active))) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && active === last) {
        e.preventDefault();
        first.focus();
      }
    };

    document.addEventListener('keydown', onKeyDown, true);
    return () => document.removeEventListener('keydown', onKeyDown, true);
  }, [dismissible, focusables, onClose]);

  // Rendered into <body>: an overlay nested inside a transformed or
  // `overflow: hidden` ancestor (the editor shell) would otherwise be clipped,
  // or have its fixed positioning broken by a transform establishing a
  // containing block.
  return createPortal(
    <div
      className={`fixed inset-0 z-[100] flex items-center justify-center p-4 ${overlayClassName}`}
      // A backdrop click closes; a click that started inside the dialog and
      // ended on the backdrop (a text selection dragged too far) does not.
      onMouseDown={(e) => {
        if (dismissible && e.target === e.currentTarget) onClose();
      }}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        className={`outline-none ${className}`}
      >
        {/* Panels render their own <h2>; this carries the accessible name so
            the dialog is announced even before the user reaches the heading. */}
        <span id={titleId} className="sr-only">
          {label}
        </span>
        {children}
      </div>
    </div>,
    document.body,
  );
}
