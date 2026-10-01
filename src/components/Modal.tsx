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

  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null;
    closeRef.current?.focus();
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('keydown', onKey);
      opener?.focus?.();
    };
  }, [onClose]);

  return (
    <div className="modal-layer">
      <button
        type="button"
        className="modal-backdrop"
        aria-label={backdropLabel ?? `Close ${title.toLowerCase()}`}
        onClick={onClose}
      />
      <div
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
