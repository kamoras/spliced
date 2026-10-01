// Accessible modal/sheet: labelled dialog, Escape and backdrop close, focus
// moves to the close button on open and returns to the opener on close.
// Renders as a bottom sheet on phones and a centred dialog on wider screens.

import { useEffect, useRef } from 'react';
import type { ReactNode } from 'react';
import Icon from './Icon.jsx';

interface ModalProps {
  title: string;
  onClose: () => void;
  children: ReactNode;
  // Accessible name for the backdrop button (defaults to "Close <title>").
  backdropLabel?: string;
  className?: string;
}

export default function Modal({
  title,
  onClose,
  children,
  backdropLabel,
  className,
}: ModalProps) {
  const closeRef = useRef<HTMLButtonElement | null>(null);
  const id = `modal-${title.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`;

  const layerRef = useRef<HTMLDivElement | null>(null);
  const dialogRef = useRef<HTMLDivElement | null>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null;
    closeRef.current?.focus();
    // Everything else on the page is inert while the dialog is open.
    const layer = layerRef.current;
    const others = layer?.parentElement
      ? [...layer.parentElement.children].filter((el) => el !== layer)
      : [];
    others.forEach((el) => el.setAttribute('inert', ''));
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onCloseRef.current();
      if (e.key !== 'Tab' || !dialogRef.current) return;
      // Keep Tab inside the dialog.
      const focusable = [
        ...dialogRef.current.querySelectorAll<HTMLElement>(
          'button:not([disabled]), a[href], input:not([disabled]), summary, [tabindex]:not([tabindex="-1"])'
        ),
      ];
      if (!focusable.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    }
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('keydown', onKey);
      others.forEach((el) => el.removeAttribute('inert'));
      opener?.focus?.();
    };
  }, []);

  return (
    <div className="modal-layer" ref={layerRef}>
      <button
        type="button"
        className="modal-backdrop"
        aria-label={backdropLabel ?? `Close ${title.toLowerCase()}`}
        onClick={onClose}
      />
      <div
        ref={dialogRef}
        className={`modal${className ? ` ${className}` : ''}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby={id}
      >
        <div className="modal-head">
          <h2 id={id}>{title}</h2>
          <button
            ref={closeRef}
            type="button"
            className="icon-btn"
            onClick={onClose}
            aria-label="Close"
          >
            <Icon name="close" />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
