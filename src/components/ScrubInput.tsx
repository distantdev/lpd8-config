import React, { useEffect, useRef, useState } from 'react';
import { midiNoteToName, parseMidiNoteInput } from '../engine/musicNotes';

interface ScrubInputProps {
  value: number;
  min: number;
  max: number;
  onChange: (next: number) => void;
  displayMode?: 'number' | 'note';
  variant?: 'pill' | 'inline';
  prefix?: string;
  previewValue?: number | null;
  size?: 'sm' | 'md' | 'lg';
  stepFast?: number;
  ariaLabel?: string;
  className?: string;
  disabled?: boolean;
}

export const ScrubInput: React.FC<ScrubInputProps> = ({
  value,
  min,
  max,
  onChange,
  displayMode = 'number',
  variant = 'pill',
  prefix,
  previewValue = null,
  size = 'md',
  stepFast,
  ariaLabel,
  className = '',
  disabled = false,
}) => {
  const [isEditing, setIsEditing] = useState(false);
  const [draft, setDraft] = useState('');
  const [isDragging, setIsDragging] = useState(false);

  const btnRef = useRef<HTMLButtonElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const lastPointerTypeRef = useRef<string>('');
  const dragStateRef = useRef<{
    active: boolean;
    startY: number;
    startVal: number;
    moved: boolean;
  }>({ active: false, startY: 0, startVal: value, moved: false });

  const fastAmount = stepFast ?? (displayMode === 'note' ? 12 : 10);

  const clampValue = (v: number) => Math.max(min, Math.min(max, Math.round(v)));

  useEffect(() => {
    if (isEditing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [isEditing]);

  useEffect(() => {
    const el = btnRef.current;
    if (!el || isEditing || disabled) return;

    const handleWheel = (e: WheelEvent) => {
      if (document.activeElement !== el) return;
      e.preventDefault();
      const step = e.shiftKey ? fastAmount : 1;
      const dir = e.deltaY < 0 ? 1 : -1;
      const next = clampValue(value + dir * step);
      if (next !== value) {
        onChange(next);
      }
    };

    el.addEventListener('wheel', handleWheel, { passive: false });
    return () => el.removeEventListener('wheel', handleWheel);
  }, [value, min, max, fastAmount, isEditing, disabled, onChange]);

  const startEditing = () => {
    if (disabled) return;
    setDraft(String(value));
    setIsEditing(true);
  };

  const commitDraft = () => {
    const parsed =
      displayMode === 'note'
        ? parseMidiNoteInput(draft)
        : /^-?\d+$/.test(draft.trim())
          ? Number.parseInt(draft.trim(), 10)
          : null;

    if (parsed !== null) {
      const clamped = clampValue(parsed);
      if (clamped !== value) {
        onChange(clamped);
      }
    }
    setIsEditing(false);
  };

  const handlePointerDown = (e: React.PointerEvent<HTMLButtonElement>) => {
    if (disabled || e.button !== 0) return;
    lastPointerTypeRef.current = e.pointerType;
    if (e.pointerType !== 'mouse') {
      // Touch/pen uses native tap/click without stealing page scroll
      return;
    }
    e.stopPropagation();
    e.currentTarget.focus();
    e.currentTarget.setPointerCapture(e.pointerId);
    dragStateRef.current = {
      active: true,
      startY: e.clientY,
      startVal: value,
      moved: false,
    };
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLButtonElement>) => {
    const state = dragStateRef.current;
    if (!state.active) return;
    const deltaY = state.startY - e.clientY;
    if (!state.moved && Math.abs(deltaY) > 3) {
      state.moved = true;
      setIsDragging(true);
    }
    if (state.moved) {
      const pxPerStep = e.shiftKey ? 2 : 5;
      const next = clampValue(state.startVal + Math.round(deltaY / pxPerStep));
      if (next !== value) {
        onChange(next);
      }
    }
  };

  const handlePointerUp = (e: React.PointerEvent<HTMLButtonElement>) => {
    const state = dragStateRef.current;
    if (!state.active) return;
    state.active = false;
    setIsDragging(false);
    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch {
      // Ignore if capture was already released
    }
    if (!state.moved) {
      startEditing();
    }
  };

  const handleClick = (e: React.MouseEvent<HTMLButtonElement>) => {
    e.stopPropagation();
    if (lastPointerTypeRef.current !== 'mouse') {
      startEditing();
    }
    lastPointerTypeRef.current = '';
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLButtonElement>) => {
    if (disabled) return;
    if (e.key === 'ArrowUp' || e.key === 'ArrowRight') {
      e.preventDefault();
      const step = e.shiftKey ? fastAmount : 1;
      onChange(clampValue(value + step));
    } else if (e.key === 'ArrowDown' || e.key === 'ArrowLeft') {
      e.preventDefault();
      const step = e.shiftKey ? fastAmount : 1;
      onChange(clampValue(value - step));
    } else if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      startEditing();
    }
  };

  const hasPreview = previewValue !== null && previewValue !== value;

  if (isEditing) {
    return (
      <input
        ref={inputRef}
        type="text"
        inputMode={displayMode === 'note' ? 'text' : 'numeric'}
        className={`scrub-edit scrub-edit--${size} ${className}`}
        value={draft}
        aria-label={ariaLabel}
        placeholder={displayMode === 'note' ? '36 or C2' : `${min}-${max}`}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commitDraft}
        onPointerDown={(e) => e.stopPropagation()}
        onKeyDown={(e) => {
          e.stopPropagation();
          if (e.key === 'Enter') {
            commitDraft();
          } else if (e.key === 'Escape') {
            setIsEditing(false);
          }
        }}
      />
    );
  }

  return (
    <button
      ref={btnRef}
      type="button"
      disabled={disabled}
      aria-label={ariaLabel}
      title={
        displayMode === 'note'
          ? 'Click to type note (C2 or 36), or drag vertically with mouse'
          : 'Click to type number, or drag vertically with mouse (Shift = fast)'
      }
      className={`scrub-pill scrub-pill--${variant} scrub-pill--${size} ${
        isDragging ? 'is-dragging' : ''
      } ${hasPreview ? 'has-preview' : ''} ${className}`}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerUp}
      onClick={handleClick}
      onKeyDown={handleKeyDown}
    >
      {prefix && <span className="scrub-pill__prefix">{prefix}</span>}
      <span className="scrub-pill__val">
        {displayMode === 'note' ? (
          <>
            <span className="scrub-pill__note">{midiNoteToName(value)}</span>
            <span className="scrub-pill__num">{value}</span>
          </>
        ) : (
          <span className="scrub-pill__num">{value}</span>
        )}
      </span>
      {hasPreview && previewValue !== null && (
        <span className="scrub-pill__preview">
          → {displayMode === 'note' ? `${midiNoteToName(previewValue)}(${previewValue})` : previewValue}
        </span>
      )}
    </button>
  );
};
