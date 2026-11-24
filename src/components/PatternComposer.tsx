import React, { useEffect, useMemo, useState } from 'react';
import type { BankState, PadTriggerMode, ProgramNumber, TargetField } from '../types/lpd8';
import { PROGRAM_NUMBERS } from '../engine/factoryDefaults';
import { SCALES } from '../engine/musicNotes';
import {
  computePatternPreview,
  findNextFreeCC,
  type PatternPreviewResult,
  type PatternRule,
  type PatternSpec,
  type TraversalOrder,
} from '../engine/patternEngine';
import { TouchStepper } from './TouchStepper';

interface PatternComposerProps {
  isOpen: boolean;
  onClose: () => void;
  bank: BankState;
  focusedProgram: ProgramNumber;
  selectedPads: number[];
  selectedKnobs: number[];
  onPreviewChange: (preview: PatternPreviewResult | null) => void;
  onApplyPattern: (result: PatternPreviewResult) => void;
}

const ORDER_OPTIONS: ReadonlyArray<{ id: TraversalOrder; label: string }> = [
  { id: 'hardware', label: '1 → 8 (Hardware Order)' },
  { id: 'visual', label: 'Top Left → Bottom Right' },
  { id: 'columns', label: 'Column Pairs' },
  { id: 'reverse', label: 'Reverse 8 → 1' },
];

export const PatternComposer: React.FC<PatternComposerProps> = ({
  isOpen,
  onClose,
  bank,
  focusedProgram,
  selectedPads,
  selectedKnobs,
  onPreviewChange,
  onApplyPattern,
}) => {
  const [target, setTarget] = useState<TargetField>('knob.cc');
  const [scopePrograms, setScopePrograms] = useState<ProgramNumber[]>([1, 2, 3, 4]);
  const [useSelectionOnly, setUseSelectionOnly] = useState(false);
  const [order, setOrder] = useState<TraversalOrder>('hardware');
  const [showMore, setShowMore] = useState(false);

  const [ruleKind, setRuleKind] = useState<'sequence' | 'scale' | 'constant' | 'shift'>('sequence');
  const [seqStart, setSeqStart] = useState(0);
  const [seqStep, setSeqStep] = useState(1);
  const [seqProgMode, setSeqProgMode] = useState<'continue' | 'repeat' | 'offset'>('continue');
  const [seqProgOffset, setSeqProgOffset] = useState(8);
  const [skipUsed, setSkipUsed] = useState(false);

  const [scaleRoot, setScaleRoot] = useState(36);
  const [scaleId, setScaleId] = useState('major');
  const [scaleProgMode, setScaleProgMode] = useState<'continue' | 'repeat' | 'octave'>('octave');
  const [octaveStep, setOctaveStep] = useState(1);

  const [constValue, setConstValue] = useState(0);
  const [constPadMode, setConstPadMode] = useState<PadTriggerMode>('momentary');
  const [shiftDelta, setShiftDelta] = useState(8);

  const activeSelection = target.startsWith('pad.')
    ? selectedPads
    : target.startsWith('knob.')
      ? selectedKnobs
      : [];

  useEffect(() => {
    if (activeSelection.length === 0 && useSelectionOnly) {
      setUseSelectionOnly(false);
    }
  }, [activeSelection.length, useSelectionOnly]);

  const handleSelectTarget = (nextTarget: TargetField) => {
    setTarget(nextTarget);
    if (nextTarget === 'pad.mode') {
      setRuleKind('constant');
    } else if (nextTarget !== 'pad.note' && ruleKind === 'scale') {
      setRuleKind('sequence');
    }
    if (nextTarget === 'knob.min') setConstValue(0);
    if (nextTarget === 'knob.max') setConstValue(127);
    if (nextTarget === 'pad.note' && ruleKind === 'sequence' && seqStart === 0) {
      setSeqStart(36);
    }
  };

  const applyRecipe = (recipe: 'cc0' | 'cc1' | 'chromatic' | 'cmajor') => {
    setScopePrograms([1, 2, 3, 4]);
    setUseSelectionOnly(false);
    setOrder('hardware');
    setSkipUsed(false);

    if (recipe === 'cc0') {
      setTarget('knob.cc');
      setRuleKind('sequence');
      setSeqStart(0);
      setSeqStep(1);
      setSeqProgMode('continue');
    } else if (recipe === 'cc1') {
      setTarget('knob.cc');
      setRuleKind('sequence');
      setSeqStart(1);
      setSeqStep(1);
      setSeqProgMode('continue');
    } else if (recipe === 'chromatic') {
      setTarget('pad.note');
      setRuleKind('sequence');
      setSeqStart(36);
      setSeqStep(1);
      setSeqProgMode('continue');
    } else {
      setTarget('pad.note');
      setRuleKind('scale');
      setScaleRoot(36);
      setScaleId('major');
      setScaleProgMode('octave');
      setOctaveStep(1);
    }
  };

  const toggleProgram = (pNum: ProgramNumber) => {
    setScopePrograms((prev) =>
      prev.includes(pNum)
        ? prev.length > 1
          ? prev.filter((p) => p !== pNum)
          : prev
        : [...prev, pNum].sort((a, b) => a - b),
    );
  };

  const rule: PatternRule = useMemo(() => {
    if (ruleKind === 'scale' && target === 'pad.note') {
      return {
        kind: 'scale',
        root: scaleRoot,
        scaleId,
        progMode: scaleProgMode,
        octaveStep,
      };
    }
    if (ruleKind === 'constant') {
      return {
        kind: 'constant',
        value: target === 'pad.mode' ? constPadMode : constValue,
      };
    }
    if (ruleKind === 'shift') {
      return {
        kind: 'shift',
        delta: shiftDelta,
      };
    }
    return {
      kind: 'sequence',
      start: seqStart,
      step: seqStep,
      progMode: seqProgMode,
      progOffset: seqProgOffset,
      skipUsed,
    };
  }, [
    ruleKind,
    target,
    scaleRoot,
    scaleId,
    scaleProgMode,
    octaveStep,
    constPadMode,
    constValue,
    shiftDelta,
    seqStart,
    seqStep,
    seqProgMode,
    seqProgOffset,
    skipUsed,
  ]);

  const previewResult = useMemo(() => {
    if (!isOpen) return null;
    const spec: PatternSpec = {
      target,
      programs: scopePrograms,
      selectedIndices: useSelectionOnly && activeSelection.length > 0 ? activeSelection : undefined,
      order,
      rule,
    };
    return computePatternPreview(bank, spec);
  }, [isOpen, bank, target, scopePrograms, useSelectionOnly, activeSelection, order, rule]);

  useEffect(() => {
    onPreviewChange(isOpen ? previewResult : null);
  }, [isOpen, previewResult, onPreviewChange]);

  if (!isOpen || !previewResult) {
    return null;
  }

  const changedCount = previewResult.changes.filter((c) => c.before !== c.after).length;
  const clampedCount = previewResult.changes.filter((c) => c.clamped).length;

  const isNoteTarget = target === 'pad.note';
  const isChannelTarget = target === 'program.channel';
  const isModeTarget = target === 'pad.mode';

  const handleNextFreeCC = () => {
    const refProg = scopePrograms[0] ?? focusedProgram;
    const freeCC = findNextFreeCC(bank, bank[refProg].channel);
    setSeqStart(freeCC);
    setRuleKind('sequence');
  };

  return (
    <section className="autofill-drawer" aria-label="Auto-Fill Pattern Builder">
      <div className="autofill-drawer__head">
        <span className="autofill-drawer__title">Auto-Fill Multiple Controls</span>
        <button type="button" className="btn btn--sm btn--ghost" onClick={onClose}>
          Close ✕
        </button>
      </div>

      {/* 1-Tap Quick Recipes */}
      <div className="autofill-recipes" aria-label="Quick Recipes">
        <button type="button" className="recipe-chip" onClick={() => applyRecipe('cc0')}>
          Knobs CC 0–31 (P1–P4)
        </button>
        <button type="button" className="recipe-chip" onClick={() => applyRecipe('cc1')}>
          Knobs CC 1–32 (P1–P4)
        </button>
        <button type="button" className="recipe-chip" onClick={() => applyRecipe('chromatic')}>
          Pads Chromatic C2+ (P1–P4)
        </button>
        <button type="button" className="recipe-chip" onClick={() => applyRecipe('cmajor')}>
          Pads C Major (+1 Oct/Prog)
        </button>
      </div>

      {/* 3-Column / Stacked Clean Form */}
      <div className="autofill-grid">
        {/* Column 1: Target & Programs */}
        <div className="autofill-field">
          <span className="autofill-field__label">1. What to fill</span>
          <select
            aria-label="What to fill"
            className="select-input"
            value={target}
            onChange={(e) => handleSelectTarget(e.target.value as TargetField)}
          >
            <optgroup label="Knobs (K1–K8)">
              <option value="knob.cc">Knobs — CC Number</option>
              <option value="knob.min">Knobs — Min Value</option>
              <option value="knob.max">Knobs — Max Value</option>
            </optgroup>
            <optgroup label="Pads (Pad 1–8)">
              <option value="pad.note">Pads — MIDI Note</option>
              <option value="pad.cc">Pads — CC Number</option>
              <option value="pad.pc">Pads — Program Change</option>
              <option value="pad.mode">Pads — Trigger Mode</option>
            </optgroup>
            <optgroup label="Program">
              <option value="program.channel">Programs — MIDI Channel</option>
            </optgroup>
          </select>

          <div className="chip-group">
            {PROGRAM_NUMBERS.map((pNum) => (
              <button
                key={pNum}
                type="button"
                aria-pressed={scopePrograms.includes(pNum)}
                className={`chip is-cyan ${scopePrograms.includes(pNum) ? 'is-active' : ''}`}
                onClick={() => toggleProgram(pNum)}
              >
                P{pNum}
              </button>
            ))}
            <button
              type="button"
              className="btn btn--sm btn--ghost"
              onClick={() => setScopePrograms([focusedProgram])}
            >
              P{focusedProgram} only
            </button>
            <button
              type="button"
              className="btn btn--sm btn--ghost"
              onClick={() => setScopePrograms([1, 2, 3, 4])}
            >
              All 4
            </button>
          </div>

          {activeSelection.length > 0 && (
            <label className="toggle-check">
              <input
                type="checkbox"
                checked={useSelectionOnly}
                onChange={(e) => setUseSelectionOnly(e.target.checked)}
              />
              Selected controls only ({activeSelection.length})
            </label>
          )}
        </div>

        {/* Column 2: Pattern Type */}
        <div className="autofill-field">
          <span className="autofill-field__label">2. Pattern</span>
          <div className="chip-group">
            {!isModeTarget && (
              <button
                type="button"
                className={`chip is-cyan ${ruleKind === 'sequence' ? 'is-active' : ''}`}
                onClick={() => setRuleKind('sequence')}
              >
                Count Up/Down
              </button>
            )}
            {isNoteTarget && (
              <button
                type="button"
                className={`chip is-cyan ${ruleKind === 'scale' ? 'is-active' : ''}`}
                onClick={() => setRuleKind('scale')}
              >
                Musical Scale
              </button>
            )}
            <button
              type="button"
              className={`chip is-cyan ${ruleKind === 'constant' ? 'is-active' : ''}`}
              onClick={() => setRuleKind('constant')}
            >
              Same Value
            </button>
            {!isModeTarget && (
              <button
                type="button"
                className={`chip is-cyan ${ruleKind === 'shift' ? 'is-active' : ''}`}
                onClick={() => setRuleKind('shift')}
              >
                Shift ±
              </button>
            )}
          </div>

          {!isChannelTarget && (
            <button
              type="button"
              className="btn btn--sm btn--ghost"
              style={{ alignSelf: 'flex-start' }}
              onClick={() => setShowMore((m) => !m)}
            >
              {showMore ? 'Hide Options ▴' : 'More Options ▾'}
            </button>
          )}

          {showMore && !isChannelTarget && (
            <div className="autofill-more">
              <label className="field-inline" style={{ width: '100%' }}>
                <span>Fill Order</span>
                <select
                  aria-label="Fill Order"
                  className="select-input select-input--sm"
                  value={order}
                  onChange={(e) => setOrder(e.target.value as TraversalOrder)}
                >
                  {ORDER_OPTIONS.map((opt) => (
                    <option key={opt.id} value={opt.id}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              </label>

              {(target === 'knob.cc' || target === 'pad.cc') && ruleKind === 'sequence' && (
                <label className="toggle-check">
                  <input
                    type="checkbox"
                    checked={skipUsed}
                    onChange={(e) => setSkipUsed(e.target.checked)}
                  />
                  Skip already-used CCs on channel
                </label>
              )}
            </div>
          )}
        </div>

        {/* Column 3: Values */}
        <div className="autofill-field">
          <span className="autofill-field__label">3. Values</span>

          {ruleKind === 'sequence' && !isModeTarget && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <div className="field-inline" style={{ flexWrap: 'wrap' }}>
                <span>Start</span>
                <TouchStepper
                  value={seqStart}
                  min={isChannelTarget ? 1 : 0}
                  max={isChannelTarget ? 16 : 127}
                  displayMode={isNoteTarget ? 'note' : 'number'}
                  compact
                  ariaLabel="Pattern Sequence Start"
                  onChange={setSeqStart}
                />
                {(target === 'knob.cc' || target === 'pad.cc') && (
                  <button type="button" className="btn btn--sm" onClick={handleNextFreeCC}>
                    Next Free
                  </button>
                )}
              </div>

              <div className="field-inline" style={{ flexWrap: 'wrap' }}>
                <span>Step</span>
                <TouchStepper
                  value={seqStep}
                  min={-24}
                  max={24}
                  compact
                  ariaLabel="Pattern Sequence Step"
                  onChange={setSeqStep}
                />
                {[-1, 1, 2].map((s) => (
                  <button
                    key={s}
                    type="button"
                    className={`chip ${seqStep === s ? 'is-active' : ''}`}
                    onClick={() => setSeqStep(s)}
                  >
                    {s > 0 ? `+${s}` : s}
                  </button>
                ))}
              </div>

              {!isChannelTarget && (
                <div className="field-inline" style={{ flexWrap: 'wrap' }}>
                  <span>Across Progs</span>
                  <select
                    aria-label="Across Programs Mode"
                    className="select-input select-input--sm"
                    value={seqProgMode}
                    onChange={(e) =>
                      setSeqProgMode(e.target.value as 'continue' | 'repeat' | 'offset')
                    }
                  >
                    <option value="continue">Continue (0–7 → 8–15…)</option>
                    <option value="repeat">Repeat Same Each Program</option>
                    <option value="offset">Offset +N / Program</option>
                  </select>
                  {seqProgMode === 'offset' && (
                    <TouchStepper
                      value={seqProgOffset}
                      min={-64}
                      max={64}
                      prefix="+"
                      compact
                      ariaLabel="Program Offset"
                      onChange={setSeqProgOffset}
                    />
                  )}
                </div>
              )}
            </div>
          )}

          {ruleKind === 'scale' && isNoteTarget && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <div className="field-inline">
                <span>Root</span>
                <TouchStepper
                  value={scaleRoot}
                  min={0}
                  max={127}
                  displayMode="note"
                  compact
                  ariaLabel="Scale Root Note"
                  onChange={setScaleRoot}
                />
              </div>

              <select
                aria-label="Musical Scale"
                className="select-input select-input--sm"
                value={scaleId}
                onChange={(e) => setScaleId(e.target.value)}
              >
                {SCALES.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>

              <div className="field-inline" style={{ flexWrap: 'wrap' }}>
                <select
                  aria-label="Scale Across Programs Mode"
                  className="select-input select-input--sm"
                  value={scaleProgMode}
                  onChange={(e) =>
                    setScaleProgMode(e.target.value as 'continue' | 'repeat' | 'octave')
                  }
                >
                  <option value="octave">+1 Octave / Program</option>
                  <option value="continue">Continue Scale</option>
                  <option value="repeat">Same Scale Each Program</option>
                </select>
                {scaleProgMode === 'octave' && (
                  <TouchStepper
                    value={octaveStep}
                    min={-4}
                    max={4}
                    prefix="Oct"
                    compact
                    ariaLabel="Octave Step"
                    onChange={setOctaveStep}
                  />
                )}
              </div>
            </div>
          )}

          {ruleKind === 'constant' && (
            <div>
              {isModeTarget ? (
                <div className="segmented segmented--full">
                  <button
                    type="button"
                    className={`segmented__btn ${constPadMode === 'momentary' ? 'is-active' : ''}`}
                    onClick={() => setConstPadMode('momentary')}
                  >
                    Momentary
                  </button>
                  <button
                    type="button"
                    className={`segmented__btn ${constPadMode === 'toggle' ? 'is-active' : ''}`}
                    onClick={() => setConstPadMode('toggle')}
                  >
                    Toggle
                  </button>
                </div>
              ) : (
                <TouchStepper
                  value={constValue}
                  min={isChannelTarget ? 1 : 0}
                  max={isChannelTarget ? 16 : 127}
                  displayMode={isNoteTarget ? 'note' : 'number'}
                  compact
                  ariaLabel="Constant Fill Value"
                  onChange={setConstValue}
                />
              )}
            </div>
          )}

          {ruleKind === 'shift' && !isModeTarget && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <TouchStepper
                value={shiftDelta}
                min={-127}
                max={127}
                compact
                ariaLabel="Shift Delta"
                onChange={setShiftDelta}
              />
              <div className="chip-group">
                {[-12, -8, -1, 1, 8, 12].map((d) => (
                  <button
                    key={d}
                    type="button"
                    className={`chip ${shiftDelta === d ? 'is-active' : ''}`}
                    onClick={() => setShiftDelta(d)}
                  >
                    {d > 0 ? `+${d}` : d}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Live Preview Bar + Apply */}
      <div className="autofill-footer">
        <div className="autofill-summary">
          {scopePrograms.map((pNum) => (
            <span key={pNum} className="summary-chip">
              P{pNum}: {previewResult.summaryByProgram[pNum]}
            </span>
          ))}
          {clampedCount > 0 && (
            <span className="summary-chip" style={{ color: 'var(--status-warn)' }}>
              {clampedCount} clamped
            </span>
          )}
        </div>

        <div className="chip-group">
          <button type="button" className="btn btn--sm btn--ghost" onClick={onClose}>
            Cancel
          </button>
          <button
            type="button"
            className="btn btn--cyan"
            disabled={changedCount === 0}
            onClick={() => onApplyPattern(previewResult)}
          >
            Apply ({changedCount} changes)
          </button>
        </div>
      </div>
    </section>
  );
};
