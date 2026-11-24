import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';

interface PopoverOrSheetProps {
  open: boolean;
  onClose: () => void;
  title: string;
  align?: 'left' | 'right' | 'center';
  direction?: 'down' | 'up';
  forceSheet?: boolean;
  children: React.ReactNode;
}

export const PopoverOrSheet: React.FC<PopoverOrSheetProps> = ({
  open,
  onClose,
  title,
  align = 'right',
  direction = 'down',
  forceSheet = false,
  children,
}) => {
  const [isMobile, setIsMobile] = useState(() =>
    typeof window !== 'undefined' ? window.matchMedia('(max-width: 639px)').matches : false,
  );

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const mq = window.matchMedia('(max-width: 639px)');
    const update = () => setIsMobile(mq.matches);
    update();
    mq.addEventListener('change', update);
    return () => mq.removeEventListener('change', update);
  }, []);

  useEffect(() => {
    if (!open) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [open, onClose]);

  if (!open) return null;

  const useSheet = forceSheet || isMobile;

  const content = (
    <>
      <div
        className="pos-backdrop"
        aria-hidden="true"
        onClick={(e) => {
          e.stopPropagation();
          onClose();
        }}
      />
      <div
        role="dialog"
        aria-label={title}
        className={`pos-panel pos-panel--${direction} pos-panel--${align}`}
        style={
          forceSheet
            ? {
                position: 'fixed',
                left: 0,
                right: 0,
                bottom: 0,
                top: 'auto',
                transform: 'none',
                maxWidth: '100%',
                borderRadius: '18px 18px 0 0',
              }
            : undefined
        }
        onClick={(e) => e.stopPropagation()}
      >
        <div className="pos-panel__header">
          <span className="pos-panel__title">{title}</span>
          <button
            type="button"
            className="pos-panel__close"
            aria-label={`Close ${title}`}
            onClick={onClose}
          >
            ✕
          </button>
        </div>
        <div className="pos-panel__body">{children}</div>
      </div>
    </>
  );

  if (useSheet && typeof document !== 'undefined') {
    return createPortal(content, document.body);
  }

  return content;
};
