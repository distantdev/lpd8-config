import React, { useEffect, useMemo, useRef, useState } from 'react';
import type {
  BankState,
  KnobConfig,
  PadConfig,
  ProgramNumber,
  TargetField,
} from '../types/lpd8';
import { CONTROL_NUMBERS, PROGRAM_NUMBERS } from '../engine/factoryDefaults';
import type { ConflictReport } from '../engine/conflicts';
import { getControlConflicts } from '../engine/conflicts';
import type { DragFillCell } from '../engine/patternEngine';
import { computeDragFill } from '../engine/patternEngine';
import { midiNoteToName } from '../engine/musicNotes';
import { PopoverOrSheet } from './PopoverOrSheet';
import { ScrubInput } from './ScrubInput';
import { TouchStepper } from './TouchStepper';

interface BankMatrixViewProps {
  bank: BankState;
  previewBank: BankState | null;
  focusedProgram: ProgramNumber;
  conflicts: ConflictReport;
  onFocusProgram: (prog: ProgramNumber) => void;
  onChangeChannel: (prog: ProgramNumber, channel: number) => void;
  onUpdatePad: (prog: ProgramNumber, padNum: number, patch: Partial<PadConfig>) => void;
  onUpdateKnob: (prog: ProgramNumber, knobNum: number, patch: Partial<KnobConfig>) => void;
  onCommitDragFill: (
    target: Exclude<TargetField, 'program.channel'>,
    anchor: DragFillCell,
    trail: DragFillCell[],
    copyOnly: boolean,
  ) => void;
}

type MobileEditTarget =
  | { type: 'channel'; program: ProgramNumber }
  | { type: 'knob'; program: ProgramNumber; number: number }
  | { type: 'pad'; program: ProgramNumber; number: number };

export const BankMatrixView: React.FC<BankMatrixViewProps> = ({
  bank,
  previewBank,
  focusedProgram,
  conflicts,
  onFocusProgram,
  onChangeChannel,
  onUpdatePad,
  onUpdateKnob,
  onCommitDragFill,
}) => {
  const [section, setSection] = useState<'knobs' | 'pads'>('knobs');
  const [padField, setPadField] = useState<'note' | 'cc' | 'pc'>('note');
  const [mobileEdit, setMobileEdit] = useState<MobileEditTarget | null>(null);

  const [dragState, setDragState] = useState<{
    target: Exclude<TargetField, 'program.channel'>;
    anchor: DragFillCell;
    trail: DragFillCell[];
    copyOnly: boolean;
  } | null>(null);

  const dragRef = useRef(dragState);
  dragRef.current = dragState;

  useEffect(() => {
    if (!dragState) return;

    const handleMove = (e: PointerEvent) => {
      const current = dragRef.current;
      if (!current) return;
      const el = document.elementFromPoint(e.clientX, e.clientY);
      const cellEl = el?.closest('[data-matrix-cell]');
      const copyOnly = e.altKey;

      if (cellEl) {
        const prog = Number(cellEl.getAttribute('data-prog')) as ProgramNumber;
        const ctrl = Number(cellEl.getAttribute('data-ctrl'));
        if (prog >= 1 && prog <= 4 && ctrl >= 1 && ctrl <= 8) {
          setDragState((prev) => {
            if (!prev) return prev;
            const exists = prev.trail.some(
              (c) => c.program === prog && c.controlIndex === ctrl,
            );
            if (exists && prev.copyOnly === copyOnly) return prev;
            return {
              ...prev,
              copyOnly,
              trail: exists ? prev.trail : [...prev.trail, { program: prog, controlIndex: ctrl }],
            };
          });
          return;
        }
      }

      if (current.copyOnly !== copyOnly) {
        setDragState((prev) => (prev ? { ...prev, copyOnly } : prev));
      }
    };

    const handleUp = (e: PointerEvent) => {
      const current = dragRef.current;
      setDragState(null);
      if (!current) return;
      const filtered = current.trail.filter(
        (c) =>
          !(
            c.program === current.anchor.program &&
            c.controlIndex === current.anchor.controlIndex
          ),
      );
      if (filtered.length > 0) {
        onCommitDragFill(
          current.target,
          current.anchor,
          filtered,
          e.altKey || current.copyOnly,
        );
      }
    };

    window.addEventListener('pointermove', handleMove);
    window.addEventListener('pointerup', handleUp);
    window.addEventListener('pointercancel', handleUp);
    return () => {
      window.removeEventListener('pointermove', handleMove);
      window.removeEventListener('pointerup', handleUp);
      window.removeEventListener('pointercancel', handleUp);
    };
  }, [Boolean(dragState), onCommitDragFill]);

  const dragPreviewBank = useMemo(() => {
    if (!dragState) return null;
    const filtered = dragState.trail.filter(
      (c) =>
        !(
          c.program === dragState.anchor.program &&
          c.controlIndex === dragState.anchor.controlIndex
        ),
    );
    if (filtered.length === 0) return null;
    return computeDragFill(bank, {
      target: dragState.target,
      anchor: dragState.anchor,
      trail: filtered,
      copyOnly: dragState.copyOnly,
    }).nextBank;
  }, [dragState, bank]);

  const activePadTarget: Exclude<TargetField, 'program.channel'> =
    padField === 'cc' ? 'pad.cc' : padField === 'pc' ? 'pad.pc' : 'pad.note';

  return (
    <section className="matrix-card" aria-label="Grid View">
      <div className="matrix-toolbar">
        <div className="chip-group">
          <div className="segmented">
            <button
              type="button"
              className={`segmented__btn ${section === 'knobs' ? 'is-active' : ''}`}
              onClick={() => setSection('knobs')}
            >
              Knobs (32)
            </button>
            <button
              type="button"
              className={`segmented__btn ${section === 'pads' ? 'is-active' : ''}`}
              onClick={() => setSection('pads')}
            >
              Pads (32)
            </button>
          </div>

          {section === 'pads' && (
            <div className="segmented">
              <button
                type="button"
                className={`segmented__btn ${padField === 'note' ? 'is-active' : ''}`}
                onClick={() => setPadField('note')}
              >
                Note
              </button>
              <button
                type="button"
                className={`segmented__btn ${padField === 'cc' ? 'is-active' : ''}`}
                onClick={() => setPadField('cc')}
              >
                CC
              </button>
              <button
                type="button"
                className={`segmented__btn ${padField === 'pc' ? 'is-active' : ''}`}
                onClick={() => setPadField('pc')}
              >
                PC
              </button>
            </div>
          )}
        </div>

        <span className="header-label-desktop" style={{ fontSize: 12, color: 'var(--text-muted)' }}>
          Hover a cell&apos;s corner grip to drag-fill across programs
        </span>
      </div>

      {/* Mobile Transposed 5-Column Zero-Horizontal-Scroll Grid (<768px) */}
      <div className="matrix-mobile">
        <table className="matrix-mobile-table">
          <thead>
            <tr>
              <th>Ctrl</th>
              {PROGRAM_NUMBERS.map((pNum) => (
                <th key={pNum}>
                  <button
                    type="button"
                    className={`btn btn--sm ${focusedProgram === pNum ? 'btn--primary' : 'btn--ghost'}`}
                    style={{ width: '100%', minHeight: 32, padding: '0 4px' }}
                    onClick={() => onFocusProgram(pNum)}
                  >
                    P{pNum}
                  </button>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>Ch</td>
              {PROGRAM_NUMBERS.map((pNum) => {
                const ch = bank[pNum].channel;
                const pPrev = previewBank?.[pNum];
                const prevCh = pPrev && pPrev.channel !== ch ? pPrev.channel : null;
                return (
                  <td key={pNum}>
                    <button
                      type="button"
                      className={`matrix-mobile-cell ${prevCh !== null ? 'has-preview' : ''}`}
                      onClick={() => setMobileEdit({ type: 'channel', program: pNum })}
                    >
                      <span>{ch}</span>
                      {prevCh !== null && (
                        <span className="matrix-mobile-cell__preview">→{prevCh}</span>
                      )}
                    </button>
                  </td>
                );
              })}
            </tr>

            {CONTROL_NUMBERS.map((ctrlNum) => (
              <tr key={ctrlNum}>
                <td>{section === 'knobs' ? `K${ctrlNum}` : `P${ctrlNum}`}</td>
                {PROGRAM_NUMBERS.map((pNum) => {
                  const prog = bank[pNum];
                  const pPrev = previewBank?.[pNum] ?? null;
                  const hasIntra = getControlConflicts(
                    conflicts,
                    pNum,
                    section === 'knobs' ? 'knob' : 'pad',
                    ctrlNum,
                  ).some((c) => c.scope === 'intra');

                  if (section === 'knobs') {
                    const knob = prog.knobs.find((k) => k.number === ctrlNum)!;
                    const prevK = pPrev?.knobs.find((k) => k.number === ctrlNum) ?? null;
                    const prevCC = prevK && prevK.cc !== knob.cc ? prevK.cc : null;
                    const nonDefaultRange = knob.min !== 0 || knob.max !== 127;

                    return (
                      <td key={pNum}>
                        <button
                          type="button"
                          className={`matrix-mobile-cell ${prevCC !== null ? 'has-preview' : ''} ${
                            hasIntra ? 'has-conflict' : ''
                          }`}
                          onClick={() =>
                            setMobileEdit({ type: 'knob', program: pNum, number: ctrlNum })
                          }
                        >
                          <span>{knob.cc}</span>
                          {prevCC !== null && (
                            <span className="matrix-mobile-cell__preview">→{prevCC}</span>
                          )}
                          {nonDefaultRange && (
                            <span className="matrix-mobile-cell__sub">
                              {knob.min}-{knob.max}
                            </span>
                          )}
                        </button>
                      </td>
                    );
                  }

                  const pad = prog.pads.find((p) => p.number === ctrlNum)!;
                  const prevP = pPrev?.pads.find((p) => p.number === ctrlNum) ?? null;
                  const val = pad[padField];
                  const prevVal = prevP && prevP[padField] !== val ? prevP[padField] : null;

                  return (
                    <td key={pNum}>
                      <button
                        type="button"
                        className={`matrix-mobile-cell ${prevVal !== null ? 'has-preview' : ''} ${
                          hasIntra ? 'has-conflict' : ''
                        }`}
                        onClick={() =>
                          setMobileEdit({ type: 'pad', program: pNum, number: ctrlNum })
                        }
                      >
                        <span>{padField === 'note' ? midiNoteToName(val) : val}</span>
                        {prevVal !== null && (
                          <span className="matrix-mobile-cell__preview">
                            →{padField === 'note' ? midiNoteToName(prevVal) : prevVal}
                          </span>
                        )}
                      </button>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Desktop/Tablet 4x8 Horizontal Matrix (>=768px) */}
      <div className="matrix-desktop">
        <table className="matrix-table">
          <thead>
            <tr>
              <th className="matrix-sticky-col">Program</th>
              <th>Ch</th>
              {CONTROL_NUMBERS.map((num) => (
                <th key={num}>{section === 'knobs' ? `K${num}` : `Pad ${num}`}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {PROGRAM_NUMBERS.map((pNum) => {
              const prog = bank[pNum];
              const pPrev = previewBank?.[pNum] ?? null;

              return (
                <tr key={pNum}>
                  <td className="matrix-sticky-col">
                    <button
                      type="button"
                      className={`btn btn--sm ${focusedProgram === pNum ? 'btn--primary' : 'btn--ghost'}`}
                      onClick={() => onFocusProgram(pNum)}
                    >
                      PROG {pNum}
                    </button>
                  </td>
                  <td>
                    <ScrubInput
                      value={prog.channel}
                      min={1}
                      max={16}
                      variant="inline"
                      size="sm"
                      previewValue={pPrev && pPrev.channel !== prog.channel ? pPrev.channel : null}
                      ariaLabel={`Matrix Program ${pNum} Channel`}
                      onChange={(ch) => onChangeChannel(pNum, ch)}
                    />
                  </td>

                  {CONTROL_NUMBERS.map((ctrlNum) => {
                    const isDragTarget = dragState?.trail.some(
                      (c) => c.program === pNum && c.controlIndex === ctrlNum,
                    );
                    const cellConflicts = getControlConflicts(
                      conflicts,
                      pNum,
                      section === 'knobs' ? 'knob' : 'pad',
                      ctrlNum,
                    );
                    const hasConflict = cellConflicts.some((c) => c.scope === 'intra');

                    if (section === 'knobs') {
                      const knob = prog.knobs.find((k) => k.number === ctrlNum)!;
                      const prevKnob = pPrev?.knobs.find((k) => k.number === ctrlNum) ?? null;
                      const dKnob =
                        dragPreviewBank?.[pNum].knobs.find((k) => k.number === ctrlNum) ?? null;

                      const previewCC =
                        dKnob && dragState?.target === 'knob.cc'
                          ? dKnob.cc
                          : prevKnob && prevKnob.cc !== knob.cc
                            ? prevKnob.cc
                            : null;

                      return (
                        <td
                          key={ctrlNum}
                          data-matrix-cell="1"
                          data-prog={pNum}
                          data-ctrl={ctrlNum}
                          className={`matrix-cell ${isDragTarget ? 'is-drag-target' : ''} ${
                            hasConflict ? 'has-conflict' : ''
                          }`}
                        >
                          <ScrubInput
                            value={knob.cc}
                            min={0}
                            max={127}
                            variant="inline"
                            prefix="CC"
                            size="sm"
                            previewValue={previewCC}
                            ariaLabel={`P${pNum} K${ctrlNum} CC`}
                            onChange={(cc) => onUpdateKnob(pNum, ctrlNum, { cc })}
                          />
                          <div className="matrix-cell__sub">
                            <ScrubInput
                              value={knob.min}
                              min={0}
                              max={127}
                              variant="inline"
                              size="sm"
                              previewValue={
                                prevKnob && prevKnob.min !== knob.min ? prevKnob.min : null
                              }
                              ariaLabel={`P${pNum} K${ctrlNum} Min`}
                              onChange={(min) => onUpdateKnob(pNum, ctrlNum, { min })}
                            />
                            <span>–</span>
                            <ScrubInput
                              value={knob.max}
                              min={0}
                              max={127}
                              variant="inline"
                              size="sm"
                              previewValue={
                                prevKnob && prevKnob.max !== knob.max ? prevKnob.max : null
                              }
                              ariaLabel={`P${pNum} K${ctrlNum} Max`}
                              onChange={(max) => onUpdateKnob(pNum, ctrlNum, { max })}
                            />
                          </div>

                          <div
                            className="fill-handle"
                            title="Drag across cells to auto-increment CC"
                            onPointerDown={(e) => {
                              if (e.pointerType !== 'mouse') return;
                              e.preventDefault();
                              e.stopPropagation();
                              setDragState({
                                target: 'knob.cc',
                                anchor: { program: pNum, controlIndex: ctrlNum },
                                trail: [{ program: pNum, controlIndex: ctrlNum }],
                                copyOnly: e.altKey,
                              });
                            }}
                          />
                        </td>
                      );
                    }

                    const pad = prog.pads.find((p) => p.number === ctrlNum)!;
                    const prevPad = pPrev?.pads.find((p) => p.number === ctrlNum) ?? null;
                    const dPad =
                      dragPreviewBank?.[pNum].pads.find((p) => p.number === ctrlNum) ?? null;

                    const val = pad[padField];
                    const dragPreviewVal = dPad ? dPad[padField] : null;
                    const patPreviewVal =
                      prevPad && prevPad[padField] !== val ? prevPad[padField] : null;
                    const effectivePreview = dragPreviewVal ?? patPreviewVal;

                    return (
                      <td
                        key={ctrlNum}
                        data-matrix-cell="1"
                        data-prog={pNum}
                        data-ctrl={ctrlNum}
                        className={`matrix-cell ${isDragTarget ? 'is-drag-target' : ''} ${
                          hasConflict ? 'has-conflict' : ''
                        }`}
                      >
                        <ScrubInput
                          value={val}
                          min={0}
                          max={127}
                          variant="inline"
                          displayMode={padField === 'note' ? 'note' : 'number'}
                          prefix={padField === 'note' ? undefined : padField.toUpperCase()}
                          size="sm"
                          previewValue={effectivePreview}
                          ariaLabel={`P${pNum} Pad ${ctrlNum} ${padField}`}
                          onChange={(nextVal) =>
                            onUpdatePad(pNum, ctrlNum, { [padField]: nextVal })
                          }
                        />
                        <div className="matrix-cell__sub">
                          <button
                            type="button"
                            className={`pad-mode-toggle ${pad.mode === 'toggle' ? 'is-toggle' : ''}`}
                            onClick={() =>
                              onUpdatePad(pNum, ctrlNum, {
                                mode: pad.mode === 'momentary' ? 'toggle' : 'momentary',
                              })
                            }
                          >
                            {pad.mode === 'toggle' ? 'TOG' : 'MOM'}
                          </button>
                        </div>

                        <div
                          className="fill-handle"
                          title="Drag across cells to auto-increment"
                          onPointerDown={(e) => {
                            if (e.pointerType !== 'mouse') return;
                            e.preventDefault();
                            e.stopPropagation();
                            setDragState({
                              target: activePadTarget,
                              anchor: { program: pNum, controlIndex: ctrlNum },
                              trail: [{ program: pNum, controlIndex: ctrlNum }],
                              copyOnly: e.altKey,
                            });
                          }}
                        />
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Mobile Tap-to-Edit Bottom Sheet */}
      <PopoverOrSheet
        open={mobileEdit !== null}
        onClose={() => setMobileEdit(null)}
        forceSheet
        title={
          mobileEdit?.type === 'channel'
            ? `Program ${mobileEdit.program} Channel`
            : mobileEdit?.type === 'knob'
              ? `Program ${mobileEdit.program} · Knob ${mobileEdit.number}`
              : mobileEdit?.type === 'pad'
                ? `Program ${mobileEdit.program} · Pad ${mobileEdit.number}`
                : ''
        }
      >
        {mobileEdit?.type === 'channel' && (
          <div className="control-editor-card__row">
            <span className="control-editor-card__label">MIDI Channel</span>
            <TouchStepper
              value={bank[mobileEdit.program].channel}
              min={1}
              max={16}
              ariaLabel={`Program ${mobileEdit.program} MIDI Channel`}
              onChange={(ch) => onChangeChannel(mobileEdit.program, ch)}
            />
          </div>
        )}

        {mobileEdit?.type === 'knob' && (() => {
          const knob = bank[mobileEdit.program].knobs.find((k) => k.number === mobileEdit.number)!;
          return (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div className="control-editor-card__row">
                <span className="control-editor-card__label">CC #</span>
                <TouchStepper
                  value={knob.cc}
                  min={0}
                  max={127}
                  onChange={(cc) => onUpdateKnob(mobileEdit.program, knob.number, { cc })}
                />
              </div>
              <div className="control-editor-card__row">
                <span className="control-editor-card__label">Min</span>
                <TouchStepper
                  value={knob.min}
                  min={0}
                  max={127}
                  compact
                  onChange={(min) => onUpdateKnob(mobileEdit.program, knob.number, { min })}
                />
              </div>
              <div className="control-editor-card__row">
                <span className="control-editor-card__label">Max</span>
                <TouchStepper
                  value={knob.max}
                  min={0}
                  max={127}
                  compact
                  onChange={(max) => onUpdateKnob(mobileEdit.program, knob.number, { max })}
                />
              </div>
            </div>
          );
        })()}

        {mobileEdit?.type === 'pad' && (() => {
          const pad = bank[mobileEdit.program].pads.find((p) => p.number === mobileEdit.number)!;
          return (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div className="control-editor-card__row">
                <span className="control-editor-card__label">MIDI Note</span>
                <TouchStepper
                  value={pad.note}
                  min={0}
                  max={127}
                  displayMode="note"
                  showOctaveSteps
                  onChange={(note) => onUpdatePad(mobileEdit.program, pad.number, { note })}
                />
              </div>
              <div className="control-editor-card__row">
                <span className="control-editor-card__label">CC #</span>
                <TouchStepper
                  value={pad.cc}
                  min={0}
                  max={127}
                  compact
                  onChange={(cc) => onUpdatePad(mobileEdit.program, pad.number, { cc })}
                />
              </div>
              <div className="control-editor-card__row">
                <span className="control-editor-card__label">Prog Chg</span>
                <TouchStepper
                  value={pad.pc}
                  min={0}
                  max={127}
                  compact
                  onChange={(pc) => onUpdatePad(mobileEdit.program, pad.number, { pc })}
                />
              </div>
              <div className="control-editor-card__row">
                <span className="control-editor-card__label">Mode</span>
                <div className="segmented">
                  <button
                    type="button"
                    className={`segmented__btn ${pad.mode === 'momentary' ? 'is-active' : ''}`}
                    onClick={() => onUpdatePad(mobileEdit.program, pad.number, { mode: 'momentary' })}
                  >
                    Momentary
                  </button>
                  <button
                    type="button"
                    className={`segmented__btn ${pad.mode === 'toggle' ? 'is-active' : ''}`}
                    onClick={() => onUpdatePad(mobileEdit.program, pad.number, { mode: 'toggle' })}
                  >
                    Toggle
                  </button>
                </div>
              </div>
            </div>
          );
        })()}
      </PopoverOrSheet>
    </section>
  );
};
