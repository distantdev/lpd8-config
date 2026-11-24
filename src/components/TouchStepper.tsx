import React, { useEffect, useRef, useState } from 'react';
import { midiNoteToName, parseMidiNoteInput } from '../engine/musicNotes';

interface TouchStepperProps {
  value: number;
  min: number;
  max: number;
  onChange: (next: number) => void;
  displayMode?: 'number' | 'note';
  showOctaveSteps?: boolean;
  prefix?: string;
  compact?: boolean;
  fullWidth?: boolean;
  ariaLabel?: string;
}

export const TouchStepper: React.FC<TouchStepperProps> = ({
  value,
  min,
  max,
  onChange,
  displayMode = 'number',
  showOctaveSteps = false,
  prefix,
  compact = false,
  fullWidth = false,
  ariaLabel,
}) => {
  const [isEditing, setIsEditing] = useState(false);
  const [draft, setDraft] = useState('');
  const inputRef = useRef<HTMLInputElement | null>(null);

  const clampVal = (v: number) => Math.max(min, Math.min(max, Math.round(v)));

  useEffect(() => {
    if (isEditing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [isEditing]);

  const startEdit = () => {
    setDraft(String(value));
    setIsEditing(true);
  };

  const commit = () => {
    const parsed =
      displayMode === 'note'
        ? parseMidiNoteInput(draft)
        : /^-?\d+$/.test(draft.trim())
          ? Number.parseInt(draft.trim(), 10)
          : null;

    if (parsed !== null) {
      const clamped = clampVal(parsed);
      if (clamped !== value) {
        onChange(clamped);
      }
    }
    setIsEditing(false);
  };

  const label = ariaLabel ?? 'value';

  return (
    <div
      className={`touch-stepper ${compact ? 'touch-stepper--compact' : ''} ${
        fullWidth ? 'touch-stepper--full' : ''
      }`}
    >
      {showOctaveSteps && (
        <button
          type="button"
          className="touch-stepper__btn"
          aria-label={`Down 1 octave for ${label}`}
          disabled={value <= min}
          onClick={() => onChange(clampVal(value - 12))}
        >
          −12
        </button>
      )}
      <button
        type="button"
        className="touch-stepper__btn"
        aria-label={`Decrease ${label}`}
        disabled={value <= min}
        onClick={() => onChange(clampVal(value - 1))}
      >
        −
      </button>

      {isEditing ? (
        <input
          ref={inputRef}
          type="text"
          inputMode={displayMode === 'note' ? 'text' : 'numeric'}
          className="touch-stepper__input"
          aria-label={ariaLabel}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === 'Enter') commit();
            else if (e.key === 'Escape') setIsEditing(false);
          }}
        />
      ) : (
        <button
          type="button"
          className="touch-stepper__val"
          aria-label={ariaLabel}
          title="Tap to type value"
          onClick={startEdit}
        >
          {prefix && <span className="touch-stepper__num">{prefix}</span>}
          {displayMode === 'note' ? (
            <>
              <span className="touch-stepper__note">{midiNoteToName(value)}</span>
              <span className="touch-stepper__num">{value}</span>
            </>
          ) : (
            <span>{value}</span>
          )}
        </button>
      )}

      <button
        type="button"
        className="touch-stepper__btn"
        aria-label={`Increase ${label}`}
        disabled={value >= max}
        onClick={() => onChange(clampVal(value + 1))}
      >
        +
      </button>
      {showOctaveSteps && (
        <button
          type="button"
          className="touch-stepper__btn"
          aria-label={`Up 1 octave for ${label}`}
          disabled={value >= max}
          onClick={() => onChange(clampVal(value + 12))}
        >
          +12
        </button>
      )}
    </div>
  );
};
